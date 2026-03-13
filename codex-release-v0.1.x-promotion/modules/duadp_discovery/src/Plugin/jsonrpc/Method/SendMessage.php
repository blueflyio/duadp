<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\jsonrpc\Method;

use Drupal\ai\AiProviderPluginManager;
use Drupal\ai_agents\PluginInterfaces\AiAgentInterface;
use Drupal\ai_agents\PluginManager\AiAgentManager;
use Drupal\ai_agents\Task\Task as AgentTask;
use Drupal\bluefly_agent_platform\Event\A2aEvents;
use Drupal\bluefly_agent_platform\Event\MessageReceivedEvent;
use Drupal\bluefly_agent_platform\Event\TaskCompletedEvent;
use Drupal\bluefly_agent_platform\Event\TaskCreatedEvent;
use Drupal\bluefly_agent_platform\Event\TaskFailedEvent;
use Drupal\bluefly_agent_platform\Model\A2aMessage;
use Drupal\bluefly_agent_platform\Model\A2aTask;
use Drupal\bluefly_agent_platform\Model\Artifact;
use Drupal\bluefly_agent_platform\Model\Part\TextPart;
use Drupal\bluefly_agent_platform\Model\TaskStatus;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\jsonrpc\Exception\JsonRpcException;
use Drupal\jsonrpc\HandlerInterface;
use Drupal\jsonrpc\Object\Error;
use Drupal\jsonrpc\Object\ParameterBag;
use Drupal\jsonrpc\Plugin\JsonRpcMethodBase;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Contracts\EventDispatcher\EventDispatcherInterface;

/**
 * JSON-RPC method: message/send.
 *
 * @JsonRpcMethod(
 *   id = "message/send",
 *   usage = @Translation("Send a message to a Drupal AI agent via A2A protocol."),
 *   access = {"access a2a endpoint"},
 *   params = {
 *     "message" = @JsonRpcParameterDefinition(
 *       schema = {"type" = "object"},
 *       required = true,
 *       description = @Translation("The A2A message with role and parts.")
 *     ),
 *     "configuration" = @JsonRpcParameterDefinition(
 *       schema = {"type" = "object"},
 *       required = false,
 *       description = @Translation("Optional configuration (acceptedOutputModes, historyLength, blocking).")
 *     )
 *   }
 * )
 */
class SendMessage extends JsonRpcMethodBase {

  protected AiAgentManager $agentManager;
  protected AiProviderPluginManager $providerPlugin;
  protected ConfigFactoryInterface $configFactory;
  protected EventDispatcherInterface $eventDispatcher;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = new static($configuration, $plugin_id, $plugin_definition);
    $instance->agentManager = $container->get('plugin.manager.ai_agents');
    $instance->providerPlugin = $container->get('ai.provider');
    $instance->configFactory = $container->get('config.factory');
    $instance->eventDispatcher = $container->get('event_dispatcher');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  public function execute(ParameterBag $params) {
    $messageData = $params->get('message');

    if (empty($messageData)) {
      throw JsonRpcException::fromError(Error::invalidParams('Missing message parameter.'));
    }

    $message = A2aMessage::fromArray((array) $messageData);

    $this->eventDispatcher->dispatch(
      new MessageReceivedEvent($message),
      A2aEvents::MESSAGE_RECEIVED,
    );

    $task = new A2aTask();
    $task->addMessage($message);

    $this->eventDispatcher->dispatch(
      new TaskCreatedEvent($task),
      A2aEvents::TASK_CREATED,
    );

    $task->transitionTo(TaskStatus::STATE_WORKING, 'Processing message');

    $prompt = $message->getText();
    if (empty($prompt)) {
      $task->transitionTo(TaskStatus::STATE_FAILED, 'Empty message text');
      $this->eventDispatcher->dispatch(new TaskFailedEvent($task), A2aEvents::TASK_FAILED);
      return $task->jsonSerialize();
    }

    $agent = $this->findBestAgent($prompt);
    if ($agent === NULL) {
      $responseMessage = A2aMessage::text('agent', 'No agent available to handle this request.');
      $task->addMessage($responseMessage);
      $task->transitionTo(TaskStatus::STATE_FAILED, 'No suitable agent found');
      $this->eventDispatcher->dispatch(new TaskFailedEvent($task), A2aEvents::TASK_FAILED);
      return $task->jsonSerialize();
    }

    $defaults = $this->providerPlugin->getDefaultProviderForOperationType('chat_with_complex_json');
    if (!$defaults) {
      $task->transitionTo(TaskStatus::STATE_FAILED, 'No AI provider configured');
      $this->eventDispatcher->dispatch(new TaskFailedEvent($task), A2aEvents::TASK_FAILED);
      return $task->jsonSerialize();
    }

    $agentTask = new AgentTask($prompt);
    $agent->setTask($agentTask);
    $agent->setAiProvider($this->providerPlugin->createInstance($defaults['provider_id']));
    $agent->setModelName($defaults['model_id']);
    $agent->setAiConfiguration([]);
    $agent->setCreateDirectly(TRUE);

    try {
      $solvability = $agent->determineSolvability();
      $responseText = $this->processAgentResult($agent, $solvability);
      $state = $this->mapSolvabilityToState($solvability);
    }
    catch (\Throwable $e) {
      $responseText = 'Agent execution failed: ' . $e->getMessage();
      $state = TaskStatus::STATE_FAILED;
    }

    $responseMessage = A2aMessage::text('agent', $responseText);
    $task->addMessage($responseMessage);

    if ($state === TaskStatus::STATE_COMPLETED) {
      $task->addArtifact(new Artifact(
        parts: [new TextPart($responseText)],
        name: 'Agent Response',
      ));
    }

    $task->transitionTo($state, $responseText);

    if ($state === TaskStatus::STATE_COMPLETED) {
      $this->eventDispatcher->dispatch(new TaskCompletedEvent($task), A2aEvents::TASK_COMPLETED);
    }
    elseif ($state === TaskStatus::STATE_FAILED) {
      $this->eventDispatcher->dispatch(new TaskFailedEvent($task), A2aEvents::TASK_FAILED);
    }

    return $task->jsonSerialize();
  }

  /**
   * Find the best available agent.
   */
  protected function findBestAgent(string $prompt): ?AiAgentInterface {
    $config = $this->configFactory->get('ai_agents_communication.settings');
    $exposedAgents = $config->get('exposed_agents') ?: [];

    foreach ($this->agentManager->getDefinitions() as $agentId => $definition) {
      if (!empty($exposedAgents) && !in_array($agentId, $exposedAgents, TRUE)) {
        continue;
      }
      $agent = $this->agentManager->createInstance($agentId);
      if (!$agent->isAvailable()) {
        continue;
      }
      $access = $agent->hasAccess();
      $allowed = is_bool($access) ? $access : (method_exists($access, 'isAllowed') && $access->isAllowed());
      if (!$allowed) {
        continue;
      }
      return $agent;
    }
    return NULL;
  }

  /**
   * Process agent result based on solvability (same as MCP AiAgentCalling).
   */
  protected function processAgentResult(AiAgentInterface $agent, int $solvability): string {
    return match ($solvability) {
      AiAgentInterface::JOB_NEEDS_ANSWERS => implode("\n", $agent->askQuestion()),
      AiAgentInterface::JOB_NOT_SOLVABLE => 'Task is not solvable by this agent.',
      AiAgentInterface::JOB_SHOULD_ANSWER_QUESTION => $agent->answerQuestion(),
      AiAgentInterface::JOB_INFORMS => $agent->inform(),
      AiAgentInterface::JOB_SOLVABLE => $this->renderSolveResult($agent->solve()),
      default => 'Unknown solvability status',
    };
  }

  /**
   * Map solvability to A2A task state.
   */
  protected function mapSolvabilityToState(int $solvability): string {
    return match ($solvability) {
      AiAgentInterface::JOB_NEEDS_ANSWERS => TaskStatus::STATE_INPUT_REQUIRED,
      AiAgentInterface::JOB_NOT_SOLVABLE => TaskStatus::STATE_FAILED,
      AiAgentInterface::JOB_SOLVABLE => TaskStatus::STATE_COMPLETED,
      default => TaskStatus::STATE_COMPLETED,
    };
  }

  /**
   * Render solve() result to string.
   */
  protected function renderSolveResult(mixed $response): string {
    if ($response instanceof TranslatableMarkup) {
      try {
        return (string) $response->render();
      }
      catch (\Exception) {
        return $response->getUntranslatedString();
      }
    }
    return is_string($response) ? $response : (json_encode($response) ?: 'Task completed.');
  }

  /**
   * {@inheritdoc}
   */
  public static function outputSchema() {
    return [
      'type' => 'object',
      'properties' => [
        'id' => ['type' => 'string'],
        'status' => ['type' => 'object'],
        'history' => ['type' => 'array'],
        'artifacts' => ['type' => 'array'],
      ],
    ];
  }

}
