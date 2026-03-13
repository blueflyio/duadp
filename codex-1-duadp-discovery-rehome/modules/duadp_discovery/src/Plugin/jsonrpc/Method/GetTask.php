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
 * JSON-RPC method: tasks/get.
 *
 * Tasks are persisted via the Drupal State API using keys formatted as
 * 'a2a_task:{uuid}'. For higher-volume deployments, consider migrating
 * to ECK entity type or advancedqueue module.
 *
 * @JsonRpcMethod(
 *   id = "tasks/get",
 *   usage = @Translation("Get status and result of an A2A task."),
 *   access = {"access a2a endpoint"},
 *   params = {
 *     "id" = @JsonRpcParameterDefinition(
 *       schema = {"type" = "string"},
 *       required = true,
 *       description = @Translation("The task UUID.")
 *     ),
 *     "historyLength" = @JsonRpcParameterDefinition(
 *       schema = {"type" = "integer"},
 *       required = false,
 *       description = @Translation("Number of history messages to return.")
 *     )
 *   }
 * )
 */
class GetTask extends JsonRpcMethodBase implements ContainerFactoryPluginInterface {

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
    $task = $this->state->get('a2a_task:' . $taskId);

    if (!$task || !is_array($task)) {
      throw JsonRpcException::fromError(new Error(
        -32001,
        sprintf('Task "%s" not found.', $taskId),
      ));
    }

    $historyLength = $params->get('historyLength');
    $history = $task['history'] ?? [];
    if ($historyLength !== NULL && is_int($historyLength) && $historyLength > 0) {
      $history = array_slice($history, -$historyLength);
    }

    return [
      'id' => $taskId,
      'status' => $task['status'] ?? ['state' => 'unknown'],
      'history' => $history,
      'artifacts' => $task['artifacts'] ?? [],
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
        'history' => ['type' => 'array'],
        'artifacts' => ['type' => 'array'],
      ],
    ];
  }

}
