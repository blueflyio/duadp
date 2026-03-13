<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\tool\Tool;

use Drupal\bluefly_agent_platform\Service\CommunicationClient;
use Drupal\Core\Access\AccessResult;
use Drupal\Core\Access\AccessResultInterface;
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
 * Send a message to another agent via the A2A communication protocol.
 */
#[Tool(
  id: 'ai_agents_communication:send_message',
  label: new TranslatableMarkup('Send Agent Message'),
  description: new TranslatableMarkup('Send a message to another AI agent using the agent-to-agent communication protocol. Supports direct messaging and task delegation.'),
  operation: ToolOperation::Trigger,
  destructive: FALSE,
  input_definitions: [
    'target_agent_id' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Target Agent ID'),
      description: new TranslatableMarkup('The ID of the agent to send the message to.'),
      required: TRUE,
    ),
    'message_type' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Message Type'),
      description: new TranslatableMarkup('Type of message: "task", "query", "response", or "notification".'),
      required: TRUE,
    ),
    'payload' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Message Payload'),
      description: new TranslatableMarkup('The message content as a JSON string.'),
      required: TRUE,
    ),
  ],
  output_definitions: [
    'message_id' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Message ID'),
    ),
    'delivery_status' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Delivery Status'),
    ),
  ],
)]
class SendAgentMessage extends ToolBase {

  protected CommunicationClient $client;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->client = $container->get('ai_agents_communication.client');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  protected function doExecute(array $values): ExecutableResult {
    $targetAgentId = (string) ($values['target_agent_id'] ?? '');
    $messageType = (string) ($values['message_type'] ?? '');
    $payload = (string) ($values['payload'] ?? '');

    if (empty($targetAgentId) || empty($messageType) || empty($payload)) {
      return ExecutableResult::failure(new TranslatableMarkup('Target agent, message type, and payload are required.'));
    }

    try {
      $message = [
        'type' => $messageType,
        'payload' => json_decode($payload, TRUE) ?? [],
      ];

      $result = $this->client->send($targetAgentId, $message);

      return ExecutableResult::success(
        new TranslatableMarkup('Message sent to agent "@agent" (type: @type).', [
          '@agent' => $targetAgentId,
          '@type' => $messageType,
        ]),
        [
          'message_id' => $result['message_id'] ?? uniqid('msg_'),
          'delivery_status' => $result['status'] ?? 'sent',
        ],
      );
    }
    catch (\Exception $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Message delivery failed: @error', ['@error' => $e->getMessage()])
      );
    }
  }

  /**
   * {@inheritdoc}
   */
  protected function checkAccess(array $values, AccountInterface $account, bool $return_as_object = FALSE): bool|AccessResultInterface {
    $access = AccessResult::allowedIfHasPermission($account, 'send agent messages');
    return $return_as_object ? $access : $access->isAllowed();
  }

}
