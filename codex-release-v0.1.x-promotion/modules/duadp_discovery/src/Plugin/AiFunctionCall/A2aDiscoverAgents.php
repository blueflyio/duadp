<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\AiFunctionCall;

use Drupal\ai\Attribute\FunctionCall;
use Drupal\ai\Base\FunctionCallBase;
use Drupal\ai\Service\FunctionCalling\ExecutableFunctionCallInterface;
use Drupal\bluefly_agent_platform\Service\A2aClient;
use Drupal\Core\Plugin\Context\ContextDefinition;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * FunctionCall plugin to discover a remote A2A agent's capabilities.
 */
#[FunctionCall(
  id: 'ai_agents_communication:discover_agents',
  function_name: 'a2a_discover_agents',
  name: 'A2A Discover Agents',
  description: 'Discover a remote A2A agent by fetching its Agent Card from /.well-known/agent-card.json.',
  group: 'ai_agents_communication',
  module_dependencies: ['ai_agents_communication'],
  context_definitions: [
    'base_url' => new ContextDefinition(
      data_type: 'string',
      label: 'Base URL',
      description: 'The base URL of the remote agent (e.g., https://example.com).',
      required: TRUE,
    ),
  ],
)]
class A2aDiscoverAgents extends FunctionCallBase implements ExecutableFunctionCallInterface, ContainerFactoryPluginInterface {

  /**
   * The A2A client.
   */
  protected A2aClient $a2aClient;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): static {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->a2aClient = $container->get('ai_agents_communication.client');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  public function execute(): void {
    $baseUrl = $this->getContextValue('base_url');

    $agentCard = $this->a2aClient->discoverAgent($baseUrl);

    if ($agentCard === NULL) {
      $this->setOutput("No A2A agent found at $baseUrl");
      return;
    }

    $this->setOutput(json_encode($agentCard->jsonSerialize(), JSON_PRETTY_PRINT));
  }

}
