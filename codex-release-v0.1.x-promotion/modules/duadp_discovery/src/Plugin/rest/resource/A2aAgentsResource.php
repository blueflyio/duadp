<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\rest\resource;

use Drupal\bluefly_agent_platform\Service\AgentRegistry;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\rest\Attribute\RestResource;
use Drupal\rest\Plugin\ResourceBase;
use Drupal\rest\ResourceResponse;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * REST resource: list discovered A2A agents.
 *
 * GET /api/a2a/agents returns all active agents (same shape as AgentRegistry::discover()).
 */
#[RestResource(
  id: 'a2a_agents',
  label: new TranslatableMarkup('A2A Agents'),
  uri_paths: [
    'canonical' => '/api/a2a/agents',
  ],
)]
class A2aAgentsResource extends ResourceBase {

  /**
   * The agent registry.
   *
   * @var \Drupal\bluefly_agent_platform\Service\AgentRegistry
   */
  protected AgentRegistry $registry;

  /**
   * Constructs an A2aAgentsResource.
   *
   * @param array $configuration
   *   Plugin configuration.
   * @param string $plugin_id
   *   Plugin ID.
   * @param mixed $plugin_definition
   *   Plugin definition.
   * @param array $serializer_formats
   *   Serializer formats.
   * @param \Psr\Log\LoggerInterface $logger
   *   Logger.
   * @param \Drupal\bluefly_agent_platform\Service\AgentRegistry $registry
   *   Agent registry.
   */
  public function __construct(
    array $configuration,
    $plugin_id,
    $plugin_definition,
    array $serializer_formats,
    LoggerInterface $logger,
    AgentRegistry $registry,
  ) {
    parent::__construct($configuration, $plugin_id, $plugin_definition, $serializer_formats, $logger);
    $this->registry = $registry;
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): static {
    return new static(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->getParameter('serializer.formats'),
      $container->get('logger.factory')->get('ai_agents_communication'),
      $container->get('ai_agents_communication.registry'),
    );
  }

  /**
   * Responds to GET /api/a2a/agents.
   *
   * @return \Drupal\rest\ResourceResponse
   *   Response with agents list.
   */
  public function get(): ResourceResponse {
    $agents = $this->registry->discover();
    return new ResourceResponse(['agents' => $agents]);
  }

}
