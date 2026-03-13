<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Entity;

use Drupal\Core\Config\Entity\ConfigEntityBase;
use Drupal\Core\StringTranslation\TranslatableMarkup;

/**
 * Defines the A2A Agent config entity.
 *
 * Stores registered agent metadata for admin UI, export/import, and runtime
 * registry. AgentRegistry can sync from or use this as storage.
 *
 * @ConfigEntityType(
 *   id = "a2a_agent",
 *   label = @Translation("A2A Agent"),
 *   label_collection = @Translation("A2A Agents"),
 *   label_singular = @Translation("A2A agent"),
 *   label_plural = @Translation("A2A agents"),
 *   label_count = @PluralTranslation(
 *     singular = "@count A2A agent",
 *     plural = "@count A2A agents"
 *   ),
 *   handlers = {
 *     "list_builder" = "Drupal\bluefly_agent_platform\Entity\A2aAgentListBuilder",
 *     "form" = {
 *       "default" = "Drupal\bluefly_agent_platform\Form\A2aAgentForm",
 *       "add" = "Drupal\bluefly_agent_platform\Form\A2aAgentForm",
 *       "edit" = "Drupal\bluefly_agent_platform\Form\A2aAgentForm",
 *       "delete" = "Drupal\Core\Entity\EntityDeleteForm"
 *     }
 *   },
 *   admin_permission = "administer a2a protocol",
 *   config_prefix = "a2a_agent",
 *   entity_keys = {
 *     "id" = "id",
 *     "label" = "label",
 *     "status" = "status"
 *   },
 *   config_export = {
 *     "id",
 *     "label",
 *     "endpoint_url",
 *     "agent_type",
 *     "capabilities",
 *     "ossa_manifest",
 *     "status",
 *     "last_seen",
 *     "created",
 *     "metadata"
 *   },
 *   links = {
 *     "collection" = "/admin/config/ai/a2a/agents",
 *     "add-form" = "/admin/config/ai/a2a/agents/add",
 *     "edit-form" = "/admin/config/ai/a2a/agents/{a2a_agent}",
 *     "delete-form" = "/admin/config/ai/a2a/agents/{a2a_agent}/delete"
 *   }
 * )
 */
class A2aAgent extends ConfigEntityBase implements A2aAgentInterface {

  /**
   * The agent ID (machine name).
   *
   * @var string
   */
  protected string $id = '';

  /**
   * The human-readable agent name.
   *
   * @var string
   */
  protected string $label = '';

  /**
   * URL where the agent receives A2A messages.
   *
   * @var string
   */
  protected string $endpoint_url = '';

  /**
   * Agent type (ossa, mcp, custom).
   *
   * @var string
   */
  protected string $agent_type = 'ossa';

  /**
   * Capabilities (array of capability names or descriptors).
   *
   * @var array
   */
  protected array $capabilities = [];

  /**
   * Optional OSSA manifest data (stored as array).
   *
   * @var array|null
   */
  protected ?array $ossa_manifest = NULL;

  /**
   * Unix timestamp of last heartbeat.
   *
   * @var int
   */
  protected int $last_seen = 0;

  /**
   * Unix timestamp when the agent was registered.
   *
   * @var int
   */
  protected int $created = 0;

  /**
   * Optional metadata (key-value).
   *
   * @var array
   */
  protected array $metadata = [];

  /**
   * {@inheritdoc}
   */
  public function getEndpointUrl(): string {
    return $this->endpoint_url;
  }

  /**
   * {@inheritdoc}
   */
  public function setEndpointUrl(string $url): static {
    $this->endpoint_url = $url;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function getAgentType(): string {
    return $this->agent_type;
  }

  /**
   * {@inheritdoc}
   */
  public function setAgentType(string $type): static {
    $this->agent_type = $type;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function getCapabilities(): array {
    return $this->capabilities;
  }

  /**
   * {@inheritdoc}
   */
  public function setCapabilities(array $capabilities): static {
    $this->capabilities = $capabilities;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function getOssaManifest(): ?array {
    return $this->ossa_manifest;
  }

  /**
   * {@inheritdoc}
   */
  public function setOssaManifest(?array $manifest): static {
    $this->ossa_manifest = $manifest;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function getLastSeen(): int {
    return $this->last_seen;
  }

  /**
   * {@inheritdoc}
   */
  public function setLastSeen(int $timestamp): static {
    $this->last_seen = $timestamp;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function getCreated(): int {
    return $this->created;
  }

  /**
   * {@inheritdoc}
   */
  public function setCreated(int $timestamp): static {
    $this->created = $timestamp;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function getMetadata(): array {
    return $this->metadata;
  }

  /**
   * {@inheritdoc}
   */
  public function setMetadata(array $metadata): static {
    $this->metadata = $metadata;
    return $this;
  }

  /**
   * Returns agent data in the shape expected by AgentRegistry (array).
   *
   * @return array
   *   Keys: agent_id, agent_name, agent_type, endpoint_url, capabilities,
   *   ossa_manifest, status, last_seen, created, metadata.
   */
  public function toRegistryArray(): array {
    return [
      'agent_id' => $this->id(),
      'agent_name' => $this->label(),
      'agent_type' => $this->getAgentType(),
      'endpoint_url' => $this->getEndpointUrl(),
      'capabilities' => $this->getCapabilities(),
      'ossa_manifest' => $this->getOssaManifest(),
      'status' => $this->status() ? 'active' : 'inactive',
      'last_seen' => $this->getLastSeen(),
      'created' => $this->getCreated(),
      'metadata' => $this->getMetadata(),
    ];
  }

}
