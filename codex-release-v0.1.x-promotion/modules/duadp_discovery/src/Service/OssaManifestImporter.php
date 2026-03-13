<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

use Drupal\bluefly_agent_platform\Entity\AgentDefinitionInterface;
use Drupal\Core\Entity\EntityStorageException;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Imports OSSA manifests into AgentDefinition + ToolBinding config entities.
 *
 * Handles the full import lifecycle:
 * - Validates manifest structure (apiVersion, kind, metadata, spec).
 * - Creates or updates AgentDefinition config entities.
 * - Maps OSSA spec.tools to ToolBinding config entities.
 * - Extracts capabilities from spec.capabilities or spec.tools.
 * - Optionally bridges to ai_agents_ossa for Drupal AI Agent derivation.
 *
 * @see https://openstandardagents.org/spec
 */
class OssaManifestImporter {

  /**
   * Supported OSSA API versions.
   */
  protected const SUPPORTED_VERSIONS = [
    'ossa/v0.4',
    'ossa/v0.4.x',
    'ossa/v0.4.6',
    'ossa/v0.4.7',
    'ossa/v0.5',
    'ossa/v0.5.x',
  ];

  /**
   * Constructs an OssaManifestImporter.
   */
  public function __construct(
    protected EntityTypeManagerInterface $entityTypeManager,
    protected LoggerInterface $logger,
  ) {}

  /**
   * Imports an OSSA manifest, creating or updating agent + tool bindings.
   *
   * @param array<string, mixed> $manifest
   *   The parsed OSSA manifest (from YAML or JSON).
   * @param array<string, mixed> $options
   *   Import options:
   *   - 'update': bool — if TRUE, update existing agent (default: FALSE).
   *   - 'approval_policy': string|null — approval policy entity ID.
   *   - 'provider_profile': string|null — provider profile ID.
   *
   * @return \Drupal\bluefly_agent_platform\Entity\AgentDefinitionInterface
   *   The created or updated agent definition.
   *
   * @throws \InvalidArgumentException
   *   If manifest is invalid.
   * @throws \Drupal\Core\Entity\EntityStorageException
   *   If entity save fails.
   */
  public function import(array $manifest, array $options = []): AgentDefinitionInterface {
    $this->validateManifest($manifest);

    $metadata = $manifest['metadata'] ?? [];
    $spec = $manifest['spec'] ?? [];
    $agentId = $this->machineNameFromLabel($metadata['name'] ?? 'imported_agent');

    $agentStorage = $this->entityTypeManager->getStorage('agent_definition');
    $existing = $agentStorage->load($agentId);

    if ($existing && empty($options['update'])) {
      throw new \InvalidArgumentException("Agent '$agentId' already exists. Pass 'update' => TRUE to overwrite.");
    }

    // Extract capabilities from manifest.
    $capabilities = $this->extractCapabilities($manifest);

    $values = [
      'id' => $agentId,
      'label' => $metadata['name'] ?? $agentId,
      'description' => $metadata['description'] ?? '',
      'status' => TRUE,
      'ossa_manifest' => $manifest,
      'ossa_version' => $manifest['apiVersion'] ?? '',
      'capabilities' => $capabilities,
    ];

    if (isset($options['approval_policy'])) {
      $values['approval_policy'] = $options['approval_policy'];
    }
    if (isset($options['provider_profile'])) {
      $values['provider_profile'] = $options['provider_profile'];
    }

    // Map safety.human_in_the_loop to approval policy if no explicit policy.
    if (empty($values['approval_policy']) && !empty($spec['safety']['human_in_the_loop'])) {
      $values['approval_policy'] = $this->createApprovalPolicyFromSafety(
        $agentId,
        $spec['safety']['human_in_the_loop'],
      );
    }

    if ($existing) {
      // Update existing.
      foreach ($values as $key => $value) {
        if ($key !== 'id') {
          $existing->set($key, $value);
        }
      }
      $existing->save();
      $agent = $existing;
      $this->logger->info('Updated agent definition from OSSA manifest: @id', ['@id' => $agentId]);
    }
    else {
      // Create new.
      $agent = $agentStorage->create($values);
      $agent->save();
      $this->logger->info('Created agent definition from OSSA manifest: @id', ['@id' => $agentId]);
    }

    // Sync tool bindings.
    $this->syncToolBindings($agentId, $spec['tools'] ?? []);

    return $agent;
  }

  /**
   * Validates an OSSA manifest structure.
   *
   * @param array<string, mixed> $manifest
   *   The manifest to validate.
   *
   * @throws \InvalidArgumentException
   *   If validation fails.
   */
  public function validateManifest(array $manifest): void {
    if (empty($manifest['apiVersion'])) {
      throw new \InvalidArgumentException('OSSA manifest missing required field: apiVersion');
    }

    // Check version is supported (lenient prefix matching).
    $versionSupported = FALSE;
    foreach (self::SUPPORTED_VERSIONS as $supported) {
      if (str_starts_with($manifest['apiVersion'], $supported) || $manifest['apiVersion'] === $supported) {
        $versionSupported = TRUE;
        break;
      }
    }
    if (!$versionSupported) {
      $this->logger->warning('OSSA manifest version @v may not be fully supported.', [
        '@v' => $manifest['apiVersion'],
      ]);
    }

    if (empty($manifest['kind'])) {
      throw new \InvalidArgumentException('OSSA manifest missing required field: kind');
    }

    if (empty($manifest['metadata']['name'])) {
      throw new \InvalidArgumentException('OSSA manifest missing required field: metadata.name');
    }
  }

  /**
   * Exports an AgentDefinition back to an OSSA manifest array.
   *
   * Roundtrip: import → persist → export should produce semantically
   * identical manifests with stable diffs.
   *
   * @param \Drupal\bluefly_agent_platform\Entity\AgentDefinitionInterface $agent
   *   The agent definition to export.
   *
   * @return array<string, mixed>
   *   The OSSA manifest.
   */
  public function export(AgentDefinitionInterface $agent): array {
    $manifest = $agent->getOssaManifest();

    // If there's no stored manifest, synthesize one.
    if (empty($manifest)) {
      $manifest = [
        'apiVersion' => $agent->getOssaVersion() ?: 'ossa/v0.4',
        'kind' => 'Agent',
        'metadata' => [
          'name' => $agent->label(),
          'description' => $agent->getDescription(),
          'labels' => [],
        ],
        'spec' => [
          'tools' => [],
          'safety' => [],
        ],
      ];

      // Add tools from bindings.
      $bindings = $this->entityTypeManager
        ->getStorage('tool_binding')
        ->loadByProperties(['agent_id' => $agent->id()]);

      foreach ($bindings as $binding) {
        /** @var \Drupal\bluefly_agent_platform\Entity\ToolBinding $binding */
        $manifest['spec']['tools'][] = [
          'name' => $binding->getToolPluginId(),
          'kind' => 'drupal.tool_api',
        ];
      }
    }

    return $manifest;
  }

  /**
   * Syncs tool bindings for an agent from OSSA spec.tools.
   *
   * @param string $agentId
   *   The agent definition ID.
   * @param array<int, array<string, mixed>> $tools
   *   The OSSA spec.tools array.
   */
  protected function syncToolBindings(string $agentId, array $tools): void {
    $bindingStorage = $this->entityTypeManager->getStorage('tool_binding');

    // Remove existing bindings for this agent.
    $existing = $bindingStorage->loadByProperties(['agent_id' => $agentId]);
    foreach ($existing as $binding) {
      $binding->delete();
    }

    // Create new bindings from manifest tools.
    foreach ($tools as $i => $tool) {
      $toolName = $tool['name'] ?? "tool_$i";
      $bindingId = $agentId . '_' . $this->machineNameFromLabel($toolName);

      try {
        $binding = $bindingStorage->create([
          'id' => $bindingId,
          'agent_id' => $agentId,
          'tool_plugin_id' => $toolName,
          'label' => $toolName,
          'approval_required' => !empty($tool['approval_required']),
          'max_invocations' => $tool['max_invocations'] ?? NULL,
        ]);
        $binding->save();
      }
      catch (EntityStorageException $e) {
        $this->logger->error('Failed to create tool binding @id: @msg', [
          '@id' => $bindingId,
          '@msg' => $e->getMessage(),
        ]);
      }
    }
  }

  /**
   * Extracts capabilities from an OSSA manifest.
   *
   * @param array<string, mixed> $manifest
   *   The OSSA manifest.
   *
   * @return string[]
   *   Capability labels.
   */
  protected function extractCapabilities(array $manifest): array {
    $capabilities = [];

    // From explicit capabilities field.
    if (!empty($manifest['spec']['capabilities'])) {
      foreach ($manifest['spec']['capabilities'] as $cap) {
        $capabilities[] = is_array($cap) ? ($cap['name'] ?? '') : (string) $cap;
      }
    }

    // From tools — each tool grants a capability.
    if (!empty($manifest['spec']['tools'])) {
      foreach ($manifest['spec']['tools'] as $tool) {
        if (!empty($tool['name'])) {
          $capabilities[] = 'tool:' . $tool['name'];
        }
      }
    }

    // From protocols.
    if (!empty($manifest['spec']['protocols'])) {
      foreach ($manifest['spec']['protocols'] as $protocol) {
        $capabilities[] = 'protocol:' . (is_array($protocol) ? ($protocol['name'] ?? '') : (string) $protocol);
      }
    }

    return array_unique(array_filter($capabilities));
  }

  /**
   * Creates an ApprovalPolicy from OSSA safety.human_in_the_loop.
   *
   * @param string $agentId
   *   The agent definition ID.
   * @param array<string, mixed> $hitlConfig
   *   The human_in_the_loop section.
   *
   * @return string
   *   The created approval policy ID.
   */
  protected function createApprovalPolicyFromSafety(string $agentId, array $hitlConfig): string {
    $policyId = $agentId . '_approval';
    $policyStorage = $this->entityTypeManager->getStorage('approval_policy');

    // Map OSSA required_for to approval rules.
    $rules = [];
    $requiredFor = $hitlConfig['required_for'] ?? [];
    foreach ($requiredFor as $operation) {
      $rules[] = [
        'operation' => $operation,
        'level' => 'explicit',
      ];
    }

    try {
      $existing = $policyStorage->load($policyId);
      if ($existing) {
        $existing->set('rules', $rules);
        $existing->save();
      }
      else {
        $policy = $policyStorage->create([
          'id' => $policyId,
          'label' => "Auto-generated policy for $agentId",
          'default_level' => 'review',
          'rules' => $rules,
        ]);
        $policy->save();
      }
    }
    catch (EntityStorageException $e) {
      $this->logger->error('Failed to create approval policy @id: @msg', [
        '@id' => $policyId,
        '@msg' => $e->getMessage(),
      ]);
    }

    return $policyId;
  }

  /**
   * Converts a label to a machine name.
   */
  protected function machineNameFromLabel(string $label): string {
    $machine = mb_strtolower($label);
    $machine = str_replace(['-', '.'], '_', $machine);
    $machine = preg_replace('/[^a-z0-9_]+/', '_', $machine);
    $machine = trim($machine, '_');
    return $machine ?: 'agent';
  }

}
