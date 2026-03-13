<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\tool\Tool;

use Drupal\bluefly_agent_platform\Service\A2aClient;
use Drupal\Core\Access\AccessResult;
use Drupal\Core\Access\AccessResultInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\Session\AccountInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Core\Plugin\Context\ContextDefinition;
use Drupal\tool\Attribute\Tool;
use Drupal\tool\ExecutableResult;
use Drupal\tool\Tool\ToolBase;
use Drupal\tool\Tool\ToolOperation;
use Drupal\tool\TypedData\InputDefinition;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Get the status and result of a task from a remote A2A agent.
 *
 * Polls a remote A2A agent for the current status of a previously created
 * task. Returns the task state, any artifacts produced, and the message
 * history.
 */
#[Tool(
  id: 'ai_agents_communication:a2a_get_task',
  label: new TranslatableMarkup('A2A Get Task'),
  description: new TranslatableMarkup('Get the status and result of a task from a remote A2A agent. Use after sending a message to poll for completion.'),
  operation: ToolOperation::Read,
  destructive: FALSE,
  input_definitions: [
    'endpoint_url' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Endpoint URL'),
      description: new TranslatableMarkup('The A2A endpoint URL of the remote agent.'),
      required: TRUE,
    ),
    'task_id' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Task ID'),
      description: new TranslatableMarkup('The UUID of the task to retrieve.'),
      required: TRUE,
    ),
    'auth_key_id' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Auth Key ID'),
      description: new TranslatableMarkup('Key module key ID for Bearer authentication (optional).'),
    ),
  ],
  output_definitions: [
    'task' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Task Response'),
    ),
    'task_status' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Task Status'),
    ),
    'has_artifacts' => new ContextDefinition(
      data_type: 'boolean',
      label: new TranslatableMarkup('Has Artifacts'),
    ),
  ],
)]
class A2aGetTask extends ToolBase implements ContainerFactoryPluginInterface {

  /**
   * The A2A client service.
   */
  protected A2aClient $a2aClient;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->a2aClient = $container->get('ai_agents_communication.a2a_client');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  protected function doExecute(array $values): ExecutableResult {
    $endpointUrl = (string) ($values['endpoint_url'] ?? '');
    $taskId = (string) ($values['task_id'] ?? '');
    $authKeyId = !empty($values['auth_key_id']) ? (string) $values['auth_key_id'] : NULL;

    if (empty($endpointUrl) || empty($taskId)) {
      return ExecutableResult::failure(new TranslatableMarkup('Endpoint URL and task ID are required.'));
    }

    try {
      $result = $this->a2aClient->getTask($endpointUrl, $taskId, $authKeyId);

      if ($result === NULL) {
        return ExecutableResult::failure(
          new TranslatableMarkup('Failed to get task @id from @url.', [
            '@id' => $taskId,
            '@url' => $endpointUrl,
          ])
        );
      }

      $taskJson = json_encode($result, JSON_PRETTY_PRINT);
      $taskStatus = $result['status']['state'] ?? $result['status'] ?? 'unknown';
      $hasArtifacts = !empty($result['artifacts']);

      return ExecutableResult::success(
        new TranslatableMarkup('Task @id status: "@status" (@artifacts).', [
          '@id' => $taskId,
          '@status' => is_string($taskStatus) ? $taskStatus : json_encode($taskStatus),
          '@artifacts' => $hasArtifacts ? 'has artifacts' : 'no artifacts',
        ]),
        [
          'task' => $taskJson,
          'task_status' => is_string($taskStatus) ? $taskStatus : json_encode($taskStatus),
          'has_artifacts' => $hasArtifacts,
        ],
      );
    }
    catch (\Exception $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('A2A get task failed: @error', ['@error' => $e->getMessage()])
      );
    }
  }

  /**
   * {@inheritdoc}
   */
  protected function checkAccess(array $values, AccountInterface $account, bool $return_as_object = FALSE): bool|AccessResultInterface {
    $access = AccessResult::allowedIfHasPermission($account, 'access a2a endpoint');
    return $return_as_object ? $access : $access->isAllowed();
  }

}
