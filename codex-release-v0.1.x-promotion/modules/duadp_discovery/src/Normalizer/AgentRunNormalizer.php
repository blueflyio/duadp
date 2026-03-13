<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Normalizer;

use Drupal\bluefly_agent_platform\Entity\AgentRun;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\serialization\Normalizer\NormalizerBase;

/**
 * Normalizes AgentRun content entities with the NormalizedResultEnvelope shape.
 *
 * Produces cache tags, audit metadata, and provenance information.
 */
class AgentRunNormalizer extends NormalizerBase {

  /**
   * {@inheritdoc}
   */
  protected $supportedInterfaceOrClass = AgentRun::class;

  /**
   * The entity type manager.
   */
  protected EntityTypeManagerInterface $entityTypeManager;

  /**
   * Constructs a new AgentRunNormalizer.
   */
  public function __construct(EntityTypeManagerInterface $entity_type_manager) {
    $this->entityTypeManager = $entity_type_manager;
  }

  /**
   * {@inheritdoc}
   *
   * @param \Drupal\bluefly_agent_platform\Entity\AgentRun $object
   *   The agent run entity.
   * @param string|null $format
   *   The format.
   * @param array<string, mixed> $context
   *   Context options.
   *
   * @return array<string, mixed>
   *   The normalized array.
   */
  public function normalize(mixed $object, ?string $format = NULL, array $context = []): array {
    /** @var \Drupal\bluefly_agent_platform\Entity\AgentRun $run */
    $run = $object;

    $startedAt = $run->get('started_at')->value;
    $finishedAt = $run->get('finished_at')->value;

    // Build artifacts list (future: load from entity reference).
    $artifacts = [];

    // Build cost estimate.
    $costEstimate = NULL;
    $costTokens = $run->get('cost_tokens')->value;
    if ($costTokens) {
      $costEstimate = [
        'tokens' => (int) $costTokens,
        'provider' => $run->get('cost_provider')->value ?? 'unknown',
      ];
    }

    return [
      'id' => $run->uuid(),
      'correlation_id' => $run->getCorrelationId(),
      'status' => $run->getStatus(),
      'kind' => $run->get('kind')->value,
      'agent_id' => $run->getAgentId(),
      'flow_id' => $run->get('flow_id')->value,
      'workspace_id' => $run->get('workspace_id')->value,
      'input' => $run->getInputDecoded(),
      'output' => $run->getOutputDecoded(),
      'approval_state' => $run->get('approval_state')->value,
      'provider' => $run->get('provider')->value,
      'cost_estimate' => $costEstimate,
      'artifacts' => $artifacts,
      'error' => $run->get('error')->value,
      'retry_count' => (int) $run->get('retry_count')->value,
      'started_at' => $startedAt ? date('c', (int) $startedAt) : NULL,
      'finished_at' => $finishedAt ? date('c', (int) $finishedAt) : NULL,
      'created_at' => date('c', (int) $run->get('created')->value),
      'logs_url' => '/api/v1/runs/' . $run->uuid() . '/logs',
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function getSupportedTypes(?string $format): array {
    return [
      AgentRun::class => TRUE,
    ];
  }

}
