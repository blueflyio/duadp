<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform;

use Drupal\Core\Entity\EntityStorageInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Psr\Log\LoggerInterface;

/**
 * Agent manager service.
 *
 * Central service for agent CRUD operations and execution dispatch.
 */
class AgentManager {

  /**
   * The agent definition storage.
   */
  protected EntityStorageInterface $agentStorage;

  /**
   * The tool binding storage.
   */
  protected EntityStorageInterface $toolBindingStorage;

  /**
   * The agent run storage.
   */
  protected EntityStorageInterface $runStorage;

  /**
   * The logger.
   */
  protected LoggerInterface $logger;

  /**
   * Constructs a new AgentManager.
   */
  public function __construct(
    protected EntityTypeManagerInterface $entityTypeManager,
    protected mixed $toolManager,
    LoggerChannelFactoryInterface $loggerFactory,
  ) {
    $this->agentStorage = $entityTypeManager->getStorage('agent_definition');
    $this->toolBindingStorage = $entityTypeManager->getStorage('tool_binding');
    $this->logger = $loggerFactory->get('bluefly_agent_platform');
  }

  /**
   * Lists agent definitions with optional filtering.
   *
   * @param array<string, mixed> $filters
   *   Filters: 'status', 'search'.
   * @param int $limit
   *   Max results.
   * @param int $offset
   *   Offset.
   *
   * @return array{data: array<mixed>, meta: array{count: int, limit: int, offset: int}}
   *   Paginated result.
   */
  public function listAgents(array $filters = [], int $limit = 20, int $offset = 0): array {
    $properties = [];

    if (!empty($filters['status'])) {
      $properties['status'] = $filters['status'] === 'enabled';
    }

    $entities = $this->agentStorage->loadByProperties($properties);
    $total = count($entities);

    // Apply search filter (basic label/description matching).
    if (!empty($filters['search'])) {
      $search = mb_strtolower($filters['search']);
      $entities = array_filter($entities, function ($entity) use ($search) {
        /** @var \Drupal\bluefly_agent_platform\Entity\AgentDefinitionInterface $entity */
        return str_contains(mb_strtolower($entity->label() ?? ''), $search)
          || str_contains(mb_strtolower($entity->getDescription()), $search);
      });
      $total = count($entities);
    }

    // Paginate.
    $entities = array_slice(array_values($entities), $offset, $limit);

    return [
      'data' => $entities,
      'meta' => [
        'count' => $total,
        'limit' => $limit,
        'offset' => $offset,
      ],
    ];
  }

  /**
   * Creates an agent definition from request data.
   *
   * @param array<string, mixed> $data
   *   Agent creation data.
   *
   * @return \Drupal\bluefly_agent_platform\Entity\AgentDefinitionInterface
   *   The created agent.
   *
   * @throws \Drupal\Core\Entity\EntityStorageException
   */
  public function createAgent(array $data): mixed {
    $id = $this->machineNameFromLabel($data['name'] ?? 'agent');

    // Check for duplicate.
    if ($this->agentStorage->load($id)) {
      throw new \InvalidArgumentException("Agent '$id' already exists.");
    }

    $values = [
      'id' => $id,
      'label' => $data['name'],
      'description' => $data['description'] ?? '',
      'status' => TRUE,
      'ossa_manifest' => $data['ossa_manifest'] ?? [],
      'ossa_version' => $data['ossa_manifest']['apiVersion'] ?? '',
      'capabilities' => [],
    ];

    if (isset($data['approval_policy'])) {
      $values['approval_policy'] = $data['approval_policy'];
    }
    if (isset($data['provider_profile'])) {
      $values['provider_profile'] = $data['provider_profile'];
    }

    $agent = $this->agentStorage->create($values);
    $agent->save();

    // Create tool bindings if provided.
    if (!empty($data['tool_bindings'])) {
      foreach ($data['tool_bindings'] as $i => $binding) {
        $bindingEntity = $this->toolBindingStorage->create([
          'id' => $id . '_' . ($binding['tool_plugin_id'] ?? $i),
          'agent_id' => $id,
          'tool_plugin_id' => $binding['tool_plugin_id'] ?? '',
          'label' => $binding['label'] ?? $binding['tool_plugin_id'] ?? '',
          'approval_required' => $binding['approval_required'] ?? FALSE,
          'max_invocations' => $binding['max_invocations'] ?? NULL,
        ]);
        $bindingEntity->save();
      }
    }

    $this->logger->info('Created agent definition: @id', ['@id' => $id]);
    return $agent;
  }

  /**
   * Converts a label to a machine name.
   */
  protected function machineNameFromLabel(string $label): string {
    $machine = mb_strtolower($label);
    $machine = preg_replace('/[^a-z0-9_]+/', '_', $machine);
    $machine = trim($machine, '_');
    return $machine ?: 'agent';
  }

}
