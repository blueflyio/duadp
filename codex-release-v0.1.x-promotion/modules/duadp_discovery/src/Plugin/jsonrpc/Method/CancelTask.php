<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\jsonrpc\Method;

use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\State\StateInterface;
use Drupal\jsonrpc\Exception\JsonRpcException;
use Drupal\jsonrpc\Object\Error;
use Drupal\jsonrpc\Object\ParameterBag;
use Drupal\jsonrpc\Plugin\JsonRpcMethodBase;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * JSON-RPC method: tasks/cancel.
 *
 * @JsonRpcMethod(
 *   id = "tasks/cancel",
 *   usage = @Translation("Cancel a running A2A task."),
 *   access = {"access a2a endpoint"},
 *   params = {
 *     "id" = @JsonRpcParameterDefinition(
 *       schema = {"type" = "string"},
 *       required = true,
 *       description = @Translation("The task UUID to cancel.")
 *     )
 *   }
 * )
 */
class CancelTask extends JsonRpcMethodBase implements ContainerFactoryPluginInterface {

  /**
   * The state service.
   */
  protected StateInterface $state;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = new static($configuration, $plugin_id, $plugin_definition);
    $instance->state = $container->get('state');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  public function execute(ParameterBag $params) {
    $taskId = $params->get('id');

    if (empty($taskId)) {
      throw JsonRpcException::fromError(Error::invalidParams('Missing task id.'));
    }

    // Look up task from State API persistent storage.
    $state = $this->state;
    $task = $state->get('a2a_task:' . $taskId);

    if (!$task || !is_array($task)) {
      throw JsonRpcException::fromError(new Error(
        -32001,
        sprintf('Task "%s" not found.', $taskId),
      ));
    }

    $currentState = $task['status']['state'] ?? 'unknown';

    // Cannot cancel tasks already in terminal states.
    $terminalStates = ['completed', 'failed', 'canceled', 'rejected'];
    if (in_array($currentState, $terminalStates, TRUE)) {
      throw JsonRpcException::fromError(new Error(
        -32002,
        sprintf('Task "%s" is already in terminal state "%s" and cannot be canceled.', $taskId, $currentState),
      ));
    }

    // Update task status to canceled.
    $task['status'] = [
      'state' => 'canceled',
      'message' => 'Task canceled by client request.',
      'timestamp' => date('c'),
    ];
    $task['history'][] = [
      'role' => 'system',
      'content' => 'Task canceled.',
      'timestamp' => date('c'),
    ];

    $state->set('a2a_task:' . $taskId, $task);

    return [
      'id' => $taskId,
      'status' => $task['status'],
    ];
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
      ],
    ];
  }

}
