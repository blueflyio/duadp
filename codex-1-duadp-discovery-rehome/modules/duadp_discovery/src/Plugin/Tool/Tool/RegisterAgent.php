<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\tool\Tool;

use Drupal\bluefly_agent_platform\Service\AgentRegistry;
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
 * Register an agent in the communication registry for A2A discovery.
 */
#[Tool(
  id: 'ai_agents_communication:register_agent',
  label: new TranslatableMarkup('Register Agent'),
  description: new TranslatableMarkup('Register an AI agent in the agent-to-agent communication registry. Makes the agent discoverable for cross-site communication.'),
  operation: ToolOperation::Write,
  destructive: FALSE,
  input_definitions: [
    'agent_id' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Agent ID'),
      description: new TranslatableMarkup('Unique identifier for the agent.'),
      required: TRUE,
    ),
    'capabilities' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Capabilities'),
      description: new TranslatableMarkup('JSON array of agent capabilities (e.g., ["chat", "code-execution", "search"]).'),
      required: TRUE,
    ),
    'endpoint' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Endpoint URL'),
      description: new TranslatableMarkup('The agent communication endpoint URL.'),
    ),
  ],
  output_definitions: [
    'registration_id' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Registration ID'),
    ),
    'status' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Registration Status'),
    ),
  ],
)]
class RegisterAgent extends ToolBase {

  protected AgentRegistry $registry;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->registry = $container->get('ai_agents_communication.registry');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  protected function doExecute(array $values): ExecutableResult {
    $agentId = (string) ($values['agent_id'] ?? '');
    $capabilitiesJson = (string) ($values['capabilities'] ?? '[]');
    $endpoint = (string) ($values['endpoint'] ?? '');

    if (empty($agentId)) {
      return ExecutableResult::failure(new TranslatableMarkup('Agent ID is required.'));
    }

    $capabilities = json_decode($capabilitiesJson, TRUE) ?? [];

    try {
      $agentData = [
        'agent_id' => $agentId,
        'capabilities' => $capabilities,
        'endpoint' => $endpoint,
      ];

      $success = $this->registry->register($agentData);

      if (!$success) {
        return ExecutableResult::failure(new TranslatableMarkup('Registration failed for agent "@agent".', ['@agent' => $agentId]));
      }

      return ExecutableResult::success(
        new TranslatableMarkup('Agent "@agent" registered with @count capabilities.', [
          '@agent' => $agentId,
          '@count' => count($capabilities),
        ]),
        [
          'registration_id' => $agentId,
          'status' => 'registered',
        ],
      );
    }
    catch (\Exception $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Registration failed: @error', ['@error' => $e->getMessage()])
      );
    }
  }

  /**
   * {@inheritdoc}
   */
  protected function checkAccess(array $values, AccountInterface $account, bool $return_as_object = FALSE): bool|AccessResultInterface {
    $access = AccessResult::allowedIfHasPermission($account, 'administer ai agents');
    return $return_as_object ? $access : $access->isAllowed();
  }

}
