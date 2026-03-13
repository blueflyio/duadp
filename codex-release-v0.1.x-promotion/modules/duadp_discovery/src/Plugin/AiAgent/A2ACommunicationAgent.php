<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\AiAgent;

use Drupal\ai_agents\Attribute\AiAgent;
use Drupal\ai_agents\PluginBase\AiAgentBase;
use Drupal\ai_agents\PluginInterfaces\AiAgentInterface;
use Drupal\bluefly_agent_platform\Service\AgentRegistry;
use Drupal\bluefly_agent_platform\Service\CommunicationClient;
use Drupal\Core\Access\AccessResult;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * AI Agent for inter-agent communication via the A2A protocol.
 *
 * Handles sending messages, discovering agents, broadcasting,
 * registering agents, and health checks across the agent network.
 */
#[AiAgent(
  id: 'a2a_communication_agent',
  label: new TranslatableMarkup('A2A Communication Agent'),
  module_dependencies: [],
)]
class A2ACommunicationAgent extends AiAgentBase implements AiAgentInterface {

  /**
   * The agent registry service.
   */
  protected AgentRegistry $registry;

  /**
   * The communication client service.
   */
  protected CommunicationClient $client;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->registry = $container->get('ai_agents_communication.registry');
    $instance->client = $container->get('ai_agents_communication.client');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  public function getId(): string {
    return $this->pluginDefinition['id'];
  }

  /**
   * {@inheritdoc}
   */
  public function agentsNames(): array {
    return ['A2A Communication Agent'];
  }

  /**
   * {@inheritdoc}
   */
  public function agentsCapabilities(): array {
    return [
      [
        'name' => 'A2A Communication Agent',
        'description' => 'Manages inter-agent communication via the A2A protocol. Can send direct messages, discover agents by capability, broadcast to multiple agents, register new agents, and check network health.',
        'usage_instructions' => 'Ask this agent to communicate with other agents, find agents with specific capabilities, send notifications to agent groups, register new agent endpoints, or check if agents are online.',
        'inputs' => [
          'task_description' => 'A natural language description of the communication task.',
        ],
        'outputs' => [
          'result' => 'JSON result of the communication operation.',
        ],
      ],
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function isAvailable(): bool {
    return TRUE;
  }

  /**
   * {@inheritdoc}
   */
  public function hasAccess(): AccessResult {
    return AccessResult::allowedIfHasPermission($this->currentUser, 'send agent messages');
  }

  /**
   * {@inheritdoc}
   */
  public function determineSolvability(): int {
    // Setup the helper runner before any sub-agent calls.
    $this->agentHelper->setupRunner($this);

    $data = $this->getData();
    if (empty($data)) {
      return AiAgentInterface::JOB_NOT_SOLVABLE;
    }

    $this->determineTypeOfTask();
    $taskData = $this->getData();

    if (empty($taskData)) {
      return AiAgentInterface::JOB_NOT_SOLVABLE;
    }

    $firstEntry = reset($taskData);
    $action = $firstEntry['action'] ?? '';

    if ($action === 'fail') {
      $this->information = $firstEntry['fail_message'] ?? 'Cannot determine the A2A communication action.';
      return AiAgentInterface::JOB_INFORMS;
    }

    if ($action === 'information') {
      return AiAgentInterface::JOB_SHOULD_ANSWER_QUESTION;
    }

    return AiAgentInterface::JOB_SOLVABLE;
  }

  /**
   * Classifies the task into A2A action types.
   */
  protected function determineTypeOfTask(): void {
    try {
      $result = $this->agentHelper->runSubAgent(
        'determineA2ATask',
        $this->getContextData(),
        $this->getTaskDescription(),
        'yaml',
        'json',
      );

      if (is_array($result)) {
        $data = isset($result[0]) ? $result : [$result];
        $this->setData($data);
      }
    }
    catch (\Exception $e) {
      $this->setData([['action' => 'fail', 'fail_message' => 'Task classification failed: ' . $e->getMessage()]]);
    }
  }

  /**
   * {@inheritdoc}
   */
  public function solve(): string {
    // Setup the helper runner before execution.
    $this->agentHelper->setupRunner($this);

    $results = [];
    $data = $this->getData();

    foreach ($data as $entry) {
      $action = $entry['action'] ?? '';

      $result = match ($action) {
        'send_message' => $this->executeSendMessage($entry),
        'discover_agents' => $this->executeDiscoverAgents($entry),
        'broadcast' => $this->executeBroadcast($entry),
        'register_agent' => $this->executeRegisterAgent($entry),
        'check_health' => $this->executeHealthCheck($entry),
        default => ['error' => 'Unknown action: ' . $action],
      };

      $results[] = $result;
    }

    return json_encode($results, JSON_PRETTY_PRINT);
  }

  /**
   * Sends a direct message to a specific agent.
   */
  protected function executeSendMessage(array $entry): array {
    $targetAgentId = $entry['target_agent_id'] ?? '';
    if (empty($targetAgentId)) {
      return ['error' => 'target_agent_id is required for send_message'];
    }

    $agent = $this->registry->getAgent($targetAgentId);
    if (!$agent) {
      return ['error' => "Agent '$targetAgentId' not found in registry"];
    }

    $payload = is_string($entry['payload'] ?? NULL)
      ? (json_decode($entry['payload'], TRUE) ?? ['message' => $entry['payload']])
      : ($entry['payload'] ?? []);

    $message = [
      'type' => $entry['message_type'] ?? 'task',
      'from' => $this->getId(),
      'id' => uniqid('a2a_agent_', TRUE),
      'capability' => $entry['capability'] ?? NULL,
      'payload' => $payload,
    ];

    try {
      $response = $this->client->send($targetAgentId, $message);
      return [
        'action' => 'send_message',
        'target' => $targetAgentId,
        'status' => $response['status'] ?? 'sent',
        'response' => $response,
      ];
    }
    catch (\Exception $e) {
      return [
        'action' => 'send_message',
        'target' => $targetAgentId,
        'status' => 'error',
        'error' => $e->getMessage(),
      ];
    }
  }

  /**
   * Discovers agents matching a capability filter.
   */
  protected function executeDiscoverAgents(array $entry): array {
    $agents = $this->registry->discover();
    $capabilityFilter = $entry['capability'] ?? '';

    if (!empty($capabilityFilter)) {
      $agents = array_values(array_filter($agents, function (array $agent) use ($capabilityFilter) {
        $capabilities = $agent['capabilities'] ?? [];
        return in_array($capabilityFilter, $capabilities, TRUE);
      }));
    }

    return [
      'action' => 'discover_agents',
      'filter' => $capabilityFilter ?: 'none',
      'count' => count($agents),
      'agents' => array_map(fn(array $a) => [
        'agent_id' => $a['agent_id'],
        'agent_name' => $a['agent_name'] ?? $a['agent_id'],
        'capabilities' => $a['capabilities'] ?? [],
        'status' => $a['status'] ?? 'unknown',
      ], $agents),
    ];
  }

  /**
   * Broadcasts a message to multiple agents.
   */
  protected function executeBroadcast(array $entry): array {
    $capability = $entry['capability'] ?? '';
    $agents = $this->registry->discover();

    if (!empty($capability)) {
      $agents = array_filter($agents, function (array $agent) use ($capability) {
        $capabilities = $agent['capabilities'] ?? [];
        return in_array($capability, $capabilities, TRUE);
      });
    }

    $agentIds = array_values(array_map(fn(array $a) => $a['agent_id'], $agents));

    if (empty($agentIds)) {
      return ['action' => 'broadcast', 'error' => 'No target agents found'];
    }

    $payload = is_string($entry['payload'] ?? NULL)
      ? (json_decode($entry['payload'], TRUE) ?? ['message' => $entry['payload']])
      : ($entry['payload'] ?? []);

    $message = [
      'type' => $entry['message_type'] ?? 'notification',
      'from' => $this->getId(),
      'payload' => $payload,
    ];

    try {
      $responses = $this->client->broadcast($agentIds, $message);
      return [
        'action' => 'broadcast',
        'recipients' => count($responses),
        'capability_filter' => $capability,
        'responses' => $responses,
      ];
    }
    catch (\Exception $e) {
      return ['action' => 'broadcast', 'error' => $e->getMessage()];
    }
  }

  /**
   * Registers a new agent in the network.
   */
  protected function executeRegisterAgent(array $entry): array {
    $agentData = [
      'agent_id' => $entry['target_agent_id'] ?? $entry['agent_id'] ?? '',
      'name' => $entry['agent_name'] ?? $entry['target_agent_id'] ?? '',
      'type' => $entry['agent_type'] ?? 'custom',
      'endpoint' => $entry['endpoint_url'] ?? '',
      'capabilities' => $entry['capabilities'] ?? [],
    ];

    if (empty($agentData['agent_id']) || empty($agentData['endpoint'])) {
      return ['error' => 'agent_id and endpoint_url are required for registration'];
    }

    try {
      $success = $this->registry->register($agentData);
      return [
        'action' => 'register_agent',
        'agent_id' => $agentData['agent_id'],
        'registered' => $success,
        'status' => $success ? 'registered' : 'failed',
      ];
    }
    catch (\Exception $e) {
      return ['action' => 'register_agent', 'error' => $e->getMessage()];
    }
  }

  /**
   * Checks health of agents in the network.
   */
  protected function executeHealthCheck(array $entry): array {
    $agents = $this->registry->discover();
    $results = [];
    $active = 0;

    foreach ($agents as $agent) {
      $agentId = $agent['agent_id'];
      try {
        $response = $this->client->send($agentId, [
          'type' => 'ping',
          'from' => $this->getId(),
          'id' => uniqid('health_', TRUE),
        ]);
        $isUp = ($response['status'] ?? '') === 'pong' || !empty($response);
        if ($isUp) {
          $active++;
          $this->registry->heartbeat($agentId);
        }
        $results[$agentId] = ['status' => $isUp ? 'active' : 'unresponsive'];
      }
      catch (\Exception $e) {
        $results[$agentId] = ['status' => 'offline', 'error' => $e->getMessage()];
      }
    }

    $total = count($agents);
    return [
      'action' => 'check_health',
      'total_agents' => $total,
      'active' => $active,
      'offline' => $total - $active,
      'health_percentage' => $total > 0 ? round(($active / $total) * 100, 1) : 0,
      'agent_statuses' => $results,
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function answerQuestion(): string {
    $agents = $this->registry->discover();
    $context = "The A2A network has " . count($agents) . " registered agents. ";
    $allCapabilities = [];
    foreach ($agents as $agent) {
      $caps = $agent['capabilities'] ?? [];
      if (is_array($caps)) {
        $allCapabilities = array_merge($allCapabilities, $caps);
      }
    }
    $context .= "Capabilities include: " . implode(', ', array_unique($allCapabilities)) . ". ";

    // Build a system prompt that includes network context.
    $prompt = $context . "\nAnswer the following question about the A2A agent network.";

    try {
      // runAiProvider() signature: ($prompt, array $images = [], $strip_tags = TRUE, $promptFile = '')
      // It returns a ChatMessage directly (already normalized).
      return $this->runAiProvider($prompt)->getText();
    }
    catch (\Exception $e) {
      return 'Could not generate answer: ' . $e->getMessage();
    }
  }

  /**
   * {@inheritdoc}
   */
  public function askQuestion(): array {
    return $this->questions ?? [];
  }

  /**
   * {@inheritdoc}
   */
  public function inform(): string {
    return $this->information ?? '';
  }

  /**
   * Gets context data from the current task.
   */
  protected function getContextData(): array {
    $agents = $this->registry->discover();
    return [
      'available_agents' => array_map(fn($a) => $a['agent_id'] . ' (' . implode(', ', $a['capabilities'] ?? []) . ')', $agents),
      'agent_count' => count($agents),
    ];
  }

  /**
   * Gets the task description from current data.
   */
  protected function getTaskDescription(): string {
    $task = $this->getTask();
    return $task ? $task->getDescription() : '';
  }

}
