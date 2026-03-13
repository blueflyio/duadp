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
 * Discover registered agents and their capabilities.
 */
#[Tool(
  id: 'ai_agents_communication:discover_capabilities',
  label: new TranslatableMarkup('Discover Agent Capabilities'),
  description: new TranslatableMarkup('Query the agent registry to discover registered agents, their capabilities, and communication endpoints.'),
  operation: ToolOperation::Read,
  destructive: FALSE,
  input_definitions: [
    'capability_filter' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Capability Filter'),
      description: new TranslatableMarkup('Filter agents by capability (e.g., "chat", "code-execution"). Leave empty for all agents.'),
    ),
    'agent_id' => new InputDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Agent ID'),
      description: new TranslatableMarkup('Look up a specific agent by ID.'),
    ),
  ],
  output_definitions: [
    'agents' => new ContextDefinition(
      data_type: 'string',
      label: new TranslatableMarkup('Discovered Agents'),
    ),
    'count' => new ContextDefinition(
      data_type: 'integer',
      label: new TranslatableMarkup('Agent Count'),
    ),
  ],
)]
class DiscoverAgentCapabilities extends ToolBase {

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
    $capabilityFilter = (string) ($values['capability_filter'] ?? '');
    $agentId = (string) ($values['agent_id'] ?? '');

    try {
      if (!empty($agentId)) {
        $agent = $this->registry->getAgent($agentId);
        $agents = $agent ? [$agent] : [];
      }
      elseif (!empty($capabilityFilter)) {
        $allAgents = $this->registry->discover();
        $agents = array_values(array_filter($allAgents, function (array $agent) use ($capabilityFilter) {
          $capabilities = $agent['capabilities'] ?? [];
          return in_array($capabilityFilter, $capabilities, TRUE);
        }));
      }
      else {
        $agents = $this->registry->discover();
      }

      return ExecutableResult::success(
        new TranslatableMarkup('Found @count registered agents.', ['@count' => count($agents)]),
        [
          'agents' => json_encode($agents, JSON_PRETTY_PRINT),
          'count' => count($agents),
        ],
      );
    }
    catch (\Exception $e) {
      return ExecutableResult::failure(
        new TranslatableMarkup('Discovery failed: @error', ['@error' => $e->getMessage()])
      );
    }
  }

  /**
   * {@inheritdoc}
   */
  protected function checkAccess(array $values, AccountInterface $account, bool $return_as_object = FALSE): bool|AccessResultInterface {
    $access = AccessResult::allowedIfHasPermission($account, 'receive agent messages');
    return $return_as_object ? $access : $access->isAllowed();
  }

}
