<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

use Drupal\bluefly_agent_platform\Entity\A2aAgentInterface;
use Drupal\bluefly_agent_platform\Event\A2AAgentEvent;
use Drupal\bluefly_agent_platform\Event\A2AMessageEvents;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\State\StateInterface;
use Drupal\Core\Datetime\TimeInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\EventDispatcherInterface;

/**
 * Service for managing the agent registry.
 *
 * Uses A2aAgent config entities as storage so agents are exportable,
 * manageable in admin UI, and config sync friendly.
 */
class AgentRegistry {

  /**
   * The state service.
   *
   * @var \Drupal\Core\State\StateInterface
   */
  protected StateInterface $state;

  /**
   * The logger service.
   *
   * @var \Psr\Log\LoggerInterface
   */
  protected LoggerInterface $logger;

  /**
   * The entity type manager.
   *
   * @var \Drupal\Core\Entity\EntityTypeManagerInterface
   */
  protected EntityTypeManagerInterface $entityTypeManager;

  /**
   * The event dispatcher.
   *
   * @var \Symfony\Component\EventDispatcher\EventDispatcherInterface
   */
  protected EventDispatcherInterface $eventDispatcher;

  /**
   * The time service.
   *
   * @var \Drupal\Core\Datetime\TimeInterface
   */
  protected TimeInterface $time;

  /**
   * Constructs an AgentRegistry object.
   *
   * @param \Drupal\Core\State\StateInterface $state
   *   The state service.
   * @param \Psr\Log\LoggerInterface $logger
   *   The logger service.
   * @param \Drupal\Core\Entity\EntityTypeManagerInterface $entity_type_manager
   *   The entity type manager.
   * @param \Symfony\Component\EventDispatcher\EventDispatcherInterface $event_dispatcher
   *   The event dispatcher.
   * @param \Drupal\Core\Datetime\TimeInterface $time
   *   The time service.
   */
  public function __construct(
    StateInterface $state,
    LoggerInterface $logger,
    EntityTypeManagerInterface $entity_type_manager,
    EventDispatcherInterface $event_dispatcher,
    TimeInterface $time,
  ) {
    $this->state = $state;
    $this->logger = $logger;
    $this->entityTypeManager = $entity_type_manager;
    $this->eventDispatcher = $event_dispatcher;
    $this->time = $time;
  }

  /**
   * Register an agent in the network.
   *
   * @param array $agent_data
   *   Agent registration data (agent_id, name, type, endpoint, capabilities, etc).
   *
   * @return bool
   *   TRUE if registration successful.
   */
  public function register(array $agent_data): bool {
    try {
    $storage = $this->entityTypeManager->getStorage('a2a_agent');
    $id = $agent_data['agent_id'];
    $entity = $storage->load($id);

    if (!$entity) {
      $entity = $storage->create([
        'id' => $id,
        'label' => $agent_data['name'] ?? $agent_data['agent_id'],
        'endpoint_url' => $agent_data['endpoint'] ?? '',
        'agent_type' => $agent_data['type'] ?? 'ossa',
        'capabilities' => $agent_data['capabilities'] ?? [],
        'ossa_manifest' => $agent_data['ossa_manifest'] ?? NULL,
        'metadata' => $agent_data['metadata'] ?? [],
        'status' => TRUE,
        'created' => $this->time->getRequestTime(),
        'last_seen' => $this->time->getRequestTime(),
      ]);
    }
    else {
      $entity->setLabel($agent_data['name'] ?? $agent_data['agent_id']);
      $entity->setEndpointUrl($agent_data['endpoint'] ?? '');
      $entity->setAgentType($agent_data['type'] ?? 'ossa');
      $entity->setCapabilities($agent_data['capabilities'] ?? []);
      $entity->setOssaManifest($agent_data['ossa_manifest'] ?? NULL);
      $entity->setMetadata($agent_data['metadata'] ?? []);
      $entity->setStatus(TRUE);
      $entity->setLastSeen($this->time->getRequestTime());
    }

    $entity->save();

      $this->logger->info('Agent registered: @agent_id', [
        '@agent_id' => $id,
      ]);

      $event = new A2AAgentEvent(
        agent_id: $id,
        agent_name: $agent_data['name'] ?? $id,
        agent_type: $agent_data['type'] ?? 'ossa',
        endpoint: $agent_data['endpoint'] ?? '',
        capabilities: $agent_data['capabilities'] ?? [],
        action: 'registered',
      );
      $this->eventDispatcher->dispatch($event, A2AMessageEvents::AGENT_REGISTERED);

      return TRUE;
    }
    catch (\Exception $e) {
      $this->logger->error('Failed to register agent: @message', [
        '@message' => $e->getMessage(),
      ]);
      return FALSE;
    }
  }

  /**
   * Get agent by ID.
   *
   * @param string $agent_id
   *   The agent ID.
   *
   * @return array|null
   *   Agent data (same shape as before) or NULL if not found.
   */
  public function getAgent(string $agent_id): ?array {
    $entity = $this->entityTypeManager->getStorage('a2a_agent')->load($agent_id);
    if ($entity instanceof A2aAgentInterface) {
      return $entity->toRegistryArray();
    }
    return NULL;
  }

  /**
   * Discover all active agents.
   *
   * @return array
   *   Array of active agents (same shape as before).
   */
  public function discover(): array {
    $storage = $this->entityTypeManager->getStorage('a2a_agent');
    $ids = $storage->getQuery()
      ->accessCheck(FALSE)
      ->condition('status', TRUE)
      ->execute();
    $entities = $storage->loadMultiple($ids);
    $out = [];
    foreach ($entities as $entity) {
      if ($entity instanceof A2aAgentInterface) {
        $out[] = $entity->toRegistryArray();
      }
    }
    return $out;
  }

  /**
   * Update agent heartbeat.
   *
   * @param string $agent_id
   *   The agent ID.
   *
   * @return bool
   *   TRUE if updated successfully.
   */
  public function heartbeat(string $agent_id): bool {
    try {
      $entity = $this->entityTypeManager->getStorage('a2a_agent')->load($agent_id);
      if ($entity instanceof A2aAgentInterface) {
        $entity->setLastSeen($this->time->getRequestTime());
        $entity->setStatus(TRUE);
        $entity->save();
        return TRUE;
      }
      return FALSE;
    }
    catch (\Exception $e) {
      $this->logger->error('Failed to update heartbeat for @agent_id: @message', [
        '@agent_id' => $agent_id,
        '@message' => $e->getMessage(),
      ]);
      return FALSE;
    }
  }

  /**
   * Unregister an agent.
   *
   * @param string $agent_id
   *   The agent ID.
   *
   * @return bool
   *   TRUE if unregistered successfully.
   */
  public function unregister(string $agent_id): bool {
    $agent = $this->getAgent($agent_id);
    $agent_name = $agent ? ($agent['agent_name'] ?? $agent_id) : $agent_id;
    $agent_type = $agent ? ($agent['agent_type'] ?? 'unknown') : 'unknown';
    $endpoint = $agent ? ($agent['endpoint_url'] ?? '') : '';
    $capabilities = $agent ? ($agent['capabilities'] ?? []) : [];

    try {
      $entity = $this->entityTypeManager->getStorage('a2a_agent')->load($agent_id);
      if ($entity) {
        $entity->delete();
      }

      $this->logger->info('Agent unregistered: @agent_id', [
        '@agent_id' => $agent_id,
      ]);

      $event = new A2AAgentEvent(
        agent_id: $agent_id,
        agent_name: $agent_name,
        agent_type: $agent_type,
        endpoint: $endpoint,
        capabilities: $capabilities,
        action: 'unregistered',
      );
      $this->eventDispatcher->dispatch($event, A2AMessageEvents::AGENT_UNREGISTERED);

      return TRUE;
    }
    catch (\Exception $e) {
      $this->logger->error('Failed to unregister agent: @message', [
        '@message' => $e->getMessage(),
      ]);
      return FALSE;
    }
  }

  /**
   * Get all capabilities for an agent.
   *
   * Returns capability names from the A2aAgent entity as a list of assoc
   * arrays (name, type, description, parameters, enabled) for compatibility.
   *
   * @param string $agent_id
   *   The agent ID.
   *
   * @return array
   *   Array of capabilities.
   */
  public function getCapabilities(string $agent_id): array {
    $entity = $this->entityTypeManager->getStorage('a2a_agent')->load($agent_id);
    if (!$entity instanceof A2aAgentInterface) {
      return [];
    }
    $names = $entity->getCapabilities();
    $out = [];
    foreach ($names as $name) {
      $out[] = [
        'name' => is_string($name) ? $name : (string) $name,
        'type' => '',
        'description' => '',
        'parameters' => NULL,
        'enabled' => 1,
      ];
    }
    return $out;
  }

}
