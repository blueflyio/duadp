<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Entity;

use Drupal\Core\Config\Entity\ConfigEntityBase;

/**
 * Defines the Agent Definition config entity.
 *
 * Stores agent name, OSSA manifest reference, status, capability grants,
 * and references to provider profile and approval policy.
 *
 * @ConfigEntityType(
 *   id = "agent_definition",
 *   label = @Translation("Agent definition"),
 *   label_collection = @Translation("Agent definitions"),
 *   label_singular = @Translation("agent definition"),
 *   label_plural = @Translation("agent definitions"),
 *   handlers = {
 *     "list_builder" = "Drupal\bluefly_agent_platform\AgentDefinitionListBuilder",
 *     "form" = {
 *       "add" = "Drupal\bluefly_agent_platform\Form\AgentDefinitionForm",
 *       "edit" = "Drupal\bluefly_agent_platform\Form\AgentDefinitionForm",
 *       "delete" = "Drupal\Core\Entity\EntityDeleteForm",
 *     },
 *   },
 *   config_prefix = "agent_definition",
 *   admin_permission = "administer agents",
 *   entity_keys = {
 *     "id" = "id",
 *     "label" = "label",
 *     "status" = "status",
 *   },
 *   config_export = {
 *     "id",
 *     "label",
 *     "description",
 *     "status",
 *     "ossa_manifest",
 *     "ossa_version",
 *     "drupal_config_entity",
 *     "approval_policy",
 *     "provider_profile",
 *     "capabilities",
 *   },
 *   links = {
 *     "collection" = "/admin/config/bluefly/agents",
 *     "add-form" = "/admin/config/bluefly/agents/add",
 *     "edit-form" = "/admin/config/bluefly/agents/{agent_definition}/edit",
 *     "delete-form" = "/admin/config/bluefly/agents/{agent_definition}/delete",
 *   },
 * )
 */
class AgentDefinition extends ConfigEntityBase implements AgentDefinitionInterface {

  /**
   * The agent definition ID.
   */
  protected string $id;

  /**
   * The agent label.
   */
  protected string $label;

  /**
   * The agent description.
   */
  protected string $description = '';

  /**
   * The full OSSA manifest as a nested array.
   *
   * @var array<string, mixed>
   */
  protected array $ossa_manifest = [];

  /**
   * The OSSA spec version.
   */
  protected string $ossa_version = '';

  /**
   * Reference to the Drupal AI Agent config entity ID.
   */
  protected ?string $drupal_config_entity = NULL;

  /**
   * Reference to an ApprovalPolicy config entity ID.
   */
  protected ?string $approval_policy = NULL;

  /**
   * Reference to a provider profile ID.
   */
  protected ?string $provider_profile = NULL;

  /**
   * Capability grant labels.
   *
   * @var string[]
   */
  protected array $capabilities = [];

  /**
   * {@inheritdoc}
   */
  public function getDescription(): string {
    return $this->description;
  }

  /**
   * {@inheritdoc}
   */
  public function getOssaManifest(): array {
    return $this->ossa_manifest;
  }

  /**
   * {@inheritdoc}
   */
  public function getOssaVersion(): string {
    return $this->ossa_version;
  }

  /**
   * {@inheritdoc}
   */
  public function getDrupalConfigEntity(): ?string {
    return $this->drupal_config_entity;
  }

  /**
   * {@inheritdoc}
   */
  public function getApprovalPolicy(): ?string {
    return $this->approval_policy;
  }

  /**
   * {@inheritdoc}
   */
  public function getProviderProfile(): ?string {
    return $this->provider_profile;
  }

  /**
   * {@inheritdoc}
   */
  public function getCapabilities(): array {
    return $this->capabilities;
  }

}
