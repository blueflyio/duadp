<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Normalizer;

use Drupal\bluefly_agent_platform\Entity\AgentDefinitionInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\serialization\Normalizer\NormalizerBase;

/**
 * Normalizes AgentDefinition config entities to the API-safe shape.
 *
 * This is the anti-corruption layer: hides internal Drupal storage details
 * and produces the stable shape defined in the OpenAPI spec.
 */
class AgentDefinitionNormalizer extends NormalizerBase {

  /**
   * {@inheritdoc}
   */
  protected $supportedInterfaceOrClass = AgentDefinitionInterface::class;

  /**
   * The entity type manager.
   */
  protected EntityTypeManagerInterface $entityTypeManager;

  /**
   * Constructs a new AgentDefinitionNormalizer.
   */
  public function __construct(EntityTypeManagerInterface $entity_type_manager) {
    $this->entityTypeManager = $entity_type_manager;
  }

  /**
   * {@inheritdoc}
   *
   * @param \Drupal\bluefly_agent_platform\Entity\AgentDefinitionInterface $object
   *   The agent definition entity.
   * @param string|null $format
   *   The format.
   * @param array<string, mixed> $context
   *   Context options.
   *
   * @return array<string, mixed>
   *   The normalized array.
   */
  public function normalize(mixed $object, ?string $format = NULL, array $context = []): array {
    /** @var \Drupal\bluefly_agent_platform\Entity\AgentDefinitionInterface $agent */
    $agent = $object;

    // Build tool bindings summary.
    $toolBindings = [];
    try {
      $bindings = $this->entityTypeManager
        ->getStorage('tool_binding')
        ->loadByProperties(['agent_id' => $agent->id()]);
      foreach ($bindings as $binding) {
        /** @var \Drupal\bluefly_agent_platform\Entity\ToolBinding $binding */
        $toolBindings[] = [
          'tool_plugin_id' => $binding->getToolPluginId(),
          'label' => $binding->label(),
          'approval_required' => $binding->isApprovalRequired(),
          'max_invocations' => $binding->getMaxInvocations(),
        ];
      }
    }
    catch (\Exception) {
      // Tool bindings may not exist yet.
    }

    return [
      'id' => $agent->id(),
      'name' => $agent->label(),
      'description' => $agent->getDescription(),
      'status' => $agent->status() ? 'enabled' : 'disabled',
      'ossa_manifest' => $agent->getOssaManifest() ?: NULL,
      'ossa_version' => $agent->getOssaVersion() ?: NULL,
      'drupal_config_entity' => $agent->getDrupalConfigEntity(),
      'tool_bindings' => $toolBindings,
      'approval_policy' => $agent->getApprovalPolicy(),
      'provider_profile' => $agent->getProviderProfile(),
      'capabilities' => $agent->getCapabilities(),
      'created_at' => date('c'),
      'updated_at' => date('c'),
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function getSupportedTypes(?string $format): array {
    return [
      AgentDefinitionInterface::class => TRUE,
    ];
  }

}
