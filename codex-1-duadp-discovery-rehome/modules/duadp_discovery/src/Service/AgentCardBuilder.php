<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

use Drupal\ai_agents\PluginManager\AiAgentManager;
use Drupal\bluefly_agent_platform\Model\AgentCard;
use Drupal\bluefly_agent_platform\Model\Skill;
use Drupal\Core\Config\ConfigFactoryInterface;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Builds the Agent Card by reading AI agents from the plugin manager.
 */
class AgentCardBuilder {

  public function __construct(
    protected readonly AiAgentManager $agentManager,
    protected readonly ConfigFactoryInterface $configFactory,
    protected readonly RequestStack $requestStack,
  ) {}

  /**
   * Build the Agent Card for this Drupal site.
   *
   * @return \Drupal\bluefly_agent_platform\Model\AgentCard
   *   The agent card.
   */
  public function build(): AgentCard {
    $config = $this->configFactory->get('ai_agents_communication.settings');
    $request = $this->requestStack->getCurrentRequest();
    $baseUrl = $request ? $request->getSchemeAndHttpHost() : '';

    $skills = $this->buildSkills($config->get('exposed_agents') ?: []);

    $provider = NULL;
    $org = $config->get('provider_organization');
    $url = $config->get('provider_url');
    if ($org || $url) {
      $provider = array_filter([
        'organization' => $org,
        'url' => $url,
      ]);
    }

    $authentication = NULL;
    if ($config->get('auth_key_id')) {
      $authentication = [
        'schemes' => ['bearer'],
        'credentials' => 'Provide a Bearer token in the Authorization header.',
      ];
    }

    return new AgentCard(
      name: $config->get('agent_name') ?: 'Drupal AI Agent',
      url: $baseUrl . '/a2a',
      version: $config->get('agent_version') ?: '1.0.0',
      skills: $skills,
      description: $config->get('agent_description') ?: '',
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
      provider: $provider,
      capabilities: [
        'streaming' => FALSE,
        'pushNotifications' => FALSE,
        'stateTransitionHistory' => TRUE,
      ],
      authentication: $authentication,
    );
  }

  /**
   * Build skills from AI Agent plugin definitions.
   *
   * @param array $exposedAgents
   *   Agent IDs to expose (empty = all available).
   *
   * @return \Drupal\bluefly_agent_platform\Model\Skill[]
   *   Skills array.
   */
  protected function buildSkills(array $exposedAgents): array {
    $skills = [];

    foreach ($this->agentManager->getDefinitions() as $agentId => $definition) {
      if (!empty($exposedAgents) && !in_array($agentId, $exposedAgents, TRUE)) {
        continue;
      }

      $instance = $this->agentManager->createInstance($agentId);

      if (!$instance->isAvailable()) {
        continue;
      }

      $capabilities = $instance->agentsCapabilities();
      foreach ($capabilities as $capabilityName => $capability) {
        $skills[] = new Skill(
          id: "{$agentId}__{$capabilityName}",
          name: $capability['name'] ?? $capabilityName,
          description: $capability['description'] ?? '',
          tags: $capability['tags'] ?? [],
          examples: $capability['examples'] ?? [],
        );
      }
    }

    return $skills;
  }

  /**
   * Get available agent IDs for the settings form.
   *
   * @return array
   *   Agent ID => label pairs.
   */
  public function getAvailableAgents(): array {
    $agents = [];
    foreach ($this->agentManager->getDefinitions() as $agentId => $definition) {
      $agents[$agentId] = $definition['label'] ?? $agentId;
    }
    return $agents;
  }

}
