<?php

namespace Drupal\duadp_discovery\Entity;

use Drupal\Core\Config\Entity\ConfigEntityBase;
use Drupal\Core\Config\Entity\ConfigEntityInterface;

/**
 * Defines a DUADP Node config entity.
 *
 * Represents a remote DUADP registry node that this Drupal site
 * will sync agents/skills/tools to (or federate with).
 *
 * @ConfigEntityType(
 *   id = "duadp_node",
 *   label = @Translation("DUADP Node"),
 *   handlers = {
 *     "list_builder" = "Drupal\duadp_discovery\DuadpNodeListBuilder",
 *     "form" = {
 *       "default" = "Drupal\duadp_discovery\Form\DuadpNodeForm",
 *       "delete" = "Drupal\Core\Entity\EntityDeleteForm"
 *     }
 *   },
 *   config_prefix = "duadp_node",
 *   admin_permission = "administer duadp_discovery",
 *   entity_keys = {
 *     "id" = "id",
 *     "label" = "label",
 *   },
 *   config_export = {
 *     "id",
 *     "label",
 *     "node_url",
 *     "node_id",
 *     "trust_tier",
 *     "auth_token_key",
 *     "sync_enabled",
 *     "publish_agents",
 *     "publish_skills",
 *     "publish_tools",
 *   },
 *   links = {
 *     "edit-form" = "/admin/config/services/duadp-discovery/nodes/{duadp_node}",
 *     "delete-form" = "/admin/config/services/duadp-discovery/nodes/{duadp_node}/delete",
 *     "collection" = "/admin/config/services/duadp-discovery/nodes"
 *   }
 * )
 */
class DuadpNode extends ConfigEntityBase implements ConfigEntityInterface {

  /**
   * The config entity ID (machine name).
   */
  public string $id;

  /**
   * The human-readable label.
   */
  public string $label;

  /**
   * The base URL of the DUADP registry node.
   * E.g., "https://discover.duadp.org"
   */
  public string $node_url = '';

  /**
   * The DID-based node identifier.
   * E.g., "did:web:discover.duadp.org"
   */
  public string $node_id = '';

  /**
   * Minimum trust tier for resources published to this node.
   * One of: community, signed, verified-signature, verified, official.
   */
  public string $trust_tier = 'community';

  /**
   * The Drupal Key entity ID holding the Bearer token for auth.
   * Uses the key module — never store raw tokens in config.
   */
  public ?string $auth_token_key = NULL;

  /**
   * Whether automatic sync is enabled (e.g., on cron).
   */
  public bool $sync_enabled = TRUE;

  /**
   * Whether to publish agents to this node.
   */
  public bool $publish_agents = TRUE;

  /**
   * Whether to publish skills to this node.
   */
  public bool $publish_skills = TRUE;

  /**
   * Whether to publish tools to this node.
   */
  public bool $publish_tools = TRUE;

  /**
   * Returns the node URL, trimmed of trailing slashes.
   */
  public function getNodeUrl(): string {
    return rtrim($this->node_url, '/');
  }

  /**
   * Returns TRUE if this node is configured (has a URL).
   */
  public function isConfigured(): bool {
    return !empty($this->node_url);
  }

}
