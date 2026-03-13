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
 * Cancel a running task on a remote A2A agent.
 *
 * Sends a cancel request to a remote A2A agent for a specific task. This is
 * a destructive operation as it terminates the remote agent's work on the
 * task.
 */
#[Tool(
  id: 'ai_agents_communication:a2a_cancel_task',
  label: new TranslatableMarkup('A2A Cancel Task'),
  description: new TranslatableMarkup('Cancel a running task on a remote A2A agent. This is a destructive operation that terminates the remote agent work on the task.'),
  operation: ToolOperation::Write,
  destructive: TRUE,
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
      description: new TranslatableMarkup('The UUID of the task to cancel.'),
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
      label: new TranslatableMarkup('Cancelled Task Response'),
    ),
    'task_status' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Final Task Status'),
    ),
  ],
)]
class A2aCancelTask extends ToolBase implements ContainerFactoryPluginInterface {

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
      $result = $this->a2aClient->cancelTask($endpointUrl, $taskId, $authKeyId);

      if ($result === NULL) {
        return ExecutableResult::failure(
          new TranslatableMarkup('Failed to cancel task @id on @url.', [
            '@id' => $taskId,
            '@url' => $endpointUrl,
          ])
        );
      }

      $taskJson = json_encode($result, JSON_PRETTY_PRINT);
      $taskStatus = $result['status']['state'] ?? $result['status'] ?? 'cancelled';

      return ExecutableResult::success(
        new TranslatableMarkup('Task @id cancelled on @url. Final status: "@status".', [
          '@id' => $taskId,
          '@url' => $endpointUrl,
          '@status' => is_string($taskStatus) ? $taskStatus : json_encode($taskStatus),
        ]),
        [
          'task' => $taskJson,
          'task_status' => is_string($taskStatus) ? $taskStatus : json_encode($taskStatus),
        ],
      );
    }
    catch (\Exception $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('A2A cancel task failed: @error', ['@error' => $e->getMessage()])
      );
    }
  }

  /**
   * {@inheritdoc}
   */
  protected function checkAccess(array $values, AccountInterface $account, bool $return_as_object = FALSE): bool|AccessResultInterface {
    $access = AccessResult::allowedIfHasPermission($account, 'administer a2a protocol');
    return $return_as_object ? $access : $access->isAllowed();
  }

}
