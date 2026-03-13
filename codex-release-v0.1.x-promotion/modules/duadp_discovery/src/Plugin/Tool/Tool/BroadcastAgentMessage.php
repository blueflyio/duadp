<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\tool\Tool;

use Drupal\bluefly_agent_platform\Service\AgentRegistry;
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
 * Broadcast a message to multiple agents or all agents with a capability.
 */
#[Tool(
  id: 'ai_agents_communication:broadcast_message',
  label: new TranslatableMarkup('Broadcast Agent Message'),
  description: new TranslatableMarkup('Broadcast a message to multiple agents at once. Target by agent IDs or by capability filter to reach all agents with a specific skill.'),
  operation: ToolOperation::Trigger,
  destructive: FALSE,
  input_definitions: [
    'target_capability' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Target Capability'),
      description: new TranslatableMarkup('Broadcast to all agents with this capability (e.g., "chat").'),
    ),
    'target_agent_ids' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Target Agent IDs'),
      description: new TranslatableMarkup('Comma-separated list of agent IDs to broadcast to.'),
    ),
    'message' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Broadcast Message'),
      description: new TranslatableMarkup('The message content as a JSON string.'),
      required: TRUE,
    ),
  ],
  output_definitions: [
    'broadcast_id' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Broadcast ID'),
    ),
    'recipients' => new ContextDefinition(
      data_type: 'integer',
      label: new TranslatableMarkup('Recipients Count'),
    ),
  ],
)]
class BroadcastAgentMessage extends ToolBase {

  protected CommunicationClient $client;

  protected AgentRegistry $registry;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->client = $container->get('ai_agents_communication.client');
    $instance->registry = $container->get('ai_agents_communication.registry');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  protected function doExecute(array $values): ExecutableResult {
    $targetCapability = (string) ($values['target_capability'] ?? '');
    $targetIdsStr = (string) ($values['target_agent_ids'] ?? '');
    $message = (string) ($values['message'] ?? '');

    if (empty($message)) {
      return ExecutableResult::failure(new TranslatableMarkup('Broadcast message is required.'));
    }

    if (empty($targetCapability) && empty($targetIdsStr)) {
      return ExecutableResult::failure(new TranslatableMarkup('Either target capability or target agent IDs must be specified.'));
    }

    try {
      $targetIds = !empty($targetIdsStr) ? array_map('trim', explode(',', $targetIdsStr)) : [];
      $payload = json_decode($message, TRUE) ?? ['message' => $message];

      // Resolve capability-based targeting to agent IDs.
      if (!empty($targetCapability) && empty($targetIds)) {
        $allAgents = $this->registry->discover();
        $targetIds = array_values(array_map(
          fn(array $agent) => $agent['agent_id'],
          array_filter($allAgents, function (array $agent) use ($targetCapability) {
            $capabilities = $agent['capabilities'] ?? [];
            return in_array($targetCapability, $capabilities, TRUE);
          })
        ));
      }

      if (empty($targetIds)) {
        return ExecutableResult::failure(new TranslatableMarkup('No target agents found for the specified criteria.'));
      }

      $result = $this->client->broadcast($targetIds, $payload);

      return ExecutableResult::success(
        new TranslatableMarkup('Broadcast sent to @count recipients.', [
          '@count' => count($result),
        ]),
        [
          'broadcast_id' => uniqid('bcast_'),
          'recipients' => count($result),
        ],
      );
    }
    catch (\Exception $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Broadcast failed: @error', ['@error' => $e->getMessage()])
      );
    }
  }

  /**
   * {@inheritdoc}
   */
  protected function checkAccess(array $values, AccountInterface $account, bool $return_as_object = FALSE): bool|AccessResultInterface {
    $access = AccessResult::allowedIfHasPermission($account, 'broadcast agent messages');
    return $return_as_object ? $access : $access->isAllowed();
  }

}
