<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\tool\Tool;

use Drupal\Core\Access\AccessResult;
use Drupal\Core\Access\AccessResultInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\Session\AccountInterface;
use Drupal\Core\State\StateInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Core\Plugin\Context\ContextDefinition;
use Drupal\tool\Attribute\Tool;
use Drupal\tool\ExecutableResult;
use Drupal\tool\Tool\ToolBase;
use Drupal\tool\Tool\ToolOperation;
use Drupal\tool\TypedData\InputDefinition;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Get the status of a previously submitted agent task.
 *
 * Replaces the former GatewayController::getTaskStatus() API endpoint.
 */
#[Tool(
  id: 'ai_agents_client:get_task_status',
  label: new TranslatableMarkup('Get Task Status'),
  description: new TranslatableMarkup('Get the current status of a previously submitted agent task by its UUID.'),
  operation: ToolOperation::Read,
  destructive: FALSE,
  input_definitions: [
    'task_id' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Task ID'),
      description: new TranslatableMarkup('The UUID of the task to check status for.'),
      required: TRUE,
    ),
  ],
  output_definitions: [
    'status' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Task Status'),
    ),
    'details' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Task Details'),
      description: new TranslatableMarkup('JSON-encoded task details.'),
    ),
  ],
)]
class GetTaskStatus extends ToolBase implements ContainerFactoryPluginInterface {

  /**
   * The state service.
   *
   * @var \Drupal\Core\State\StateInterface
   */
  protected StateInterface $state;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->state = $container->get('state');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  protected function doExecute(array $values): ExecutableResult {
    $task_id = (string) ($values['task_id'] ?? '');

    if (empty($task_id)) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Task ID is required.')
      );
    }

    try {
      // Query state storage for task status.
      $task_data = $this->state->get('ai_agents_client.task.' . $task_id);

      if ($task_data === NULL) {
        // Task may still be in queue (not yet processed).
        return ExecutableResult::success(
          new TranslatableMarkup('Task "@id" is pending or not found.', ['@id' => $task_id]),
          [
            'status' => 'pending',
            'details' => json_encode([
              'task_id' => $task_id,
              'status' => 'pending',
              'message' => 'Task is queued for processing or does not exist.',
            ], JSON_PRETTY_PRINT),
          ],
        );
      }

      $status = $task_data['status'] ?? 'unknown';

      return ExecutableResult::success(
        new TranslatableMarkup('Task "@id" status: @status.', [
          '@id' => $task_id,
          '@status' => $status,
        ]),
        [
          'status' => $status,
          'details' => json_encode($task_data, JSON_PRETTY_PRINT),
        ],
      );
    }
    catch (\Exception $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Failed to retrieve task status: @error', ['@error' => $e->getMessage()])
      );
    }
  }

  /**
   * {@inheritdoc}
   */
  protected function checkAccess(array $values, AccountInterface $account, bool $return_as_object = FALSE): bool|AccessResultInterface {
    $access = AccessResult::allowedIfHasPermission($account, 'access content');
    return $return_as_object ? $access : $access->isAllowed();
  }

}
