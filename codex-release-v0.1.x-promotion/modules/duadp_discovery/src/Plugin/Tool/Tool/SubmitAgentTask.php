<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\tool\Tool;

use Drupal\advancedqueue\Job;
use Drupal\bluefly_agent_platform\Service\ClientService;
use Drupal\bluefly_agent_platform\Service\OssaClientPolicyService;
use Drupal\Core\Access\AccessResult;
use Drupal\Core\Access\AccessResultInterface;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Plugin\Context\ContextDefinition;
use Drupal\Core\Session\AccountInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\tool\Attribute\Tool;
use Drupal\tool\ExecutableResult;
use Drupal\tool\Tool\ToolBase;
use Drupal\tool\Tool\ToolOperation;
use Drupal\tool\TypedData\InputDefinition;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Submit an agent task for processing via the OSSA-compliant gateway.
 *
 * Validates the task against Cedar policy, then enqueues it via Advanced Queue
 * (agent_task job type) for async execution with retries and persistence.
 */
#[Tool(
  id: 'ai_agents_client:submit_task',
  label: new TranslatableMarkup('Submit Agent Task'),
  description: new TranslatableMarkup('Submit an agent task for processing. Authorizes via Cedar policy and queues the task for asynchronous execution.'),
  operation: ToolOperation::Trigger,
  destructive: FALSE,
  input_definitions: [
    'task_type' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Task Type'),
      description: new TranslatableMarkup('The type of agent task to execute.'),
      required: TRUE,
    ),
    'agent_id' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Agent ID'),
      description: new TranslatableMarkup('The agent identifier requesting the task.'),
      required: TRUE,
    ),
    'payload' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Task Payload'),
      description: new TranslatableMarkup('JSON-encoded task payload data.'),
      required: FALSE,
    ),
  ],
  output_definitions: [
    'status' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Task Status'),
    ),
    'site_id' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Site ID'),
    ),
  ],
)]
class SubmitAgentTask extends ToolBase {

  protected ClientService $clientService;
  protected EntityTypeManagerInterface $entityTypeManager;
  protected OssaClientPolicyService $policyService;
  protected ConfigFactoryInterface $configFactory;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->clientService = $container->get('ai_agents_client.gateway');
    $instance->entityTypeManager = $container->get('entity_type.manager');
    $instance->policyService = $container->get('ai_agents_client.policy');
    $instance->configFactory = $container->get('config.factory');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  protected function doExecute(array $values): ExecutableResult {
    $task_type = (string) ($values['task_type'] ?? '');
    $agent_id = (string) ($values['agent_id'] ?? '');
    $payload_json = (string) ($values['payload'] ?? '{}');

    if (empty($task_type) || empty($agent_id)) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Both task_type and agent_id are required.')
      );
    }

    // Cedar policy authorization check.
    if (!$this->policyService->authorizeAction($agent_id, $task_type)) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Agent action denied by Cedar policy for agent "@agent" on task "@task".', [
          '@agent' => $agent_id,
          '@task' => $task_type,
        ])
      );
    }

    // Build task data.
    $payload = json_decode($payload_json, TRUE) ?? [];
    $data = array_merge($payload, [
      'task_type' => $task_type,
      'agent_id' => $agent_id,
    ]);

    // Enqueue via Advanced Queue (agent_task job type). Queue ID from config.
    $queue_id = $this->configFactory->get('ai_agents_client.settings')->get('task_queue_id') ?: 'agent_tasks';
    $storage = $this->entityTypeManager->getStorage('advancedqueue_queue');
    $queue = $storage->load($queue_id);
    if (!$queue) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Agent tasks queue "%id" is not configured. Create the queue at Configuration > System > Queues or install optional config advancedqueue.advancedqueue_queue.agent_tasks.', [
          '%id' => $queue_id,
        ])
      );
    }
    $job = Job::create('agent_task', $data);
    $queue->enqueueJob($job);

    $config = $this->configFactory->get('ai_agents_client.settings');
    $site_id = $config->get('client_id') ?? 'unknown';

    return ExecutableResult::success(
      new TranslatableMarkup('Task "@task" authorized and queued for agent "@agent".', [
        '@task' => $task_type,
        '@agent' => $agent_id,
      ]),
      [
        'status' => 'queued',
        'site_id' => $site_id,
      ],
    );
  }

  /**
   * {@inheritdoc}
   */
  protected function checkAccess(array $values, AccountInterface $account, bool $return_as_object = FALSE): bool|AccessResultInterface {
    $access = AccessResult::allowedIfHasPermission($account, 'access content');
    return $return_as_object ? $access : $access->isAllowed();
  }

}
