<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\tool\Tool;

use Drupal\bluefly_agent_platform\Model\A2aMessage;
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
 * Send an A2A JSON-RPC message to a remote agent.
 *
 * Sends a message to a remote A2A-compliant agent using the JSON-RPC protocol.
 * Returns the task object created by the remote agent, including the task ID
 * for subsequent polling or cancellation.
 */
#[Tool(
  id: 'ai_agents_communication:a2a_send_message',
  label: new TranslatableMarkup('A2A Send Message'),
  description: new TranslatableMarkup('Send an A2A JSON-RPC message to a remote agent and receive a task object back. The task can be polled for status or cancelled.'),
  operation: ToolOperation::Trigger,
  destructive: FALSE,
  input_definitions: [
    'endpoint_url' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Endpoint URL'),
      description: new TranslatableMarkup('The A2A endpoint URL of the remote agent.'),
      required: TRUE,
    ),
    'message' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Message'),
      description: new TranslatableMarkup('The text message to send to the remote agent.'),
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
    'task_id' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Task ID'),
    ),
    'task_status' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Task Status'),
    ),
  ],
)]
class A2aSendMessage extends ToolBase implements ContainerFactoryPluginInterface {

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
    $messageText = (string) ($values['message'] ?? '');
    $authKeyId = !empty($values['auth_key_id']) ? (string) $values['auth_key_id'] : NULL;

    if (empty($endpointUrl) || empty($messageText)) {
      return ExecutableResult::failure(new TranslatableMarkup('Endpoint URL and message are required.'));
    }

    try {
      $message = A2aMessage::text('user', $messageText);
      $task = $this->a2aClient->sendMessage($endpointUrl, $message, $authKeyId);

      if ($task === NULL) {
        return ExecutableResult::failure(
          new TranslatableMarkup('Failed to send A2A message to @url.', ['@url' => $endpointUrl])
        );
      }

      $taskJson = json_encode($task, JSON_PRETTY_PRINT);
      $taskId = $task['id'] ?? '';
      $taskStatus = $task['status']['state'] ?? $task['status'] ?? 'unknown';

      return ExecutableResult::success(
        new TranslatableMarkup('A2A message sent to @url. Task @id created with status "@status".', [
          '@url' => $endpointUrl,
          '@id' => $taskId,
          '@status' => $taskStatus,
        ]),
        [
          'task' => $taskJson,
          'task_id' => $taskId,
          'task_status' => is_string($taskStatus) ? $taskStatus : json_encode($taskStatus),
        ],
      );
    }
    catch (\Exception $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('A2A send message failed: @error', ['@error' => $e->getMessage()])
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
