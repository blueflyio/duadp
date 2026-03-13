<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Entity;

use Drupal\Core\Config\Entity\ConfigEntityBase;

/**
 * Defines the Tool Binding config entity.
 *
 * Binds a Tool API plugin to an agent with constraints.
 *
 * @ConfigEntityType(
 *   id = "tool_binding",
 *   label = @Translation("Tool binding"),
 *   label_collection = @Translation("Tool bindings"),
 *   handlers = {
 *     "form" = {
 *       "delete" = "Drupal\Core\Entity\EntityDeleteForm",
 *     },
 *   },
 *   config_prefix = "tool_binding",
 *   admin_permission = "administer agents",
 *   entity_keys = {
 *     "id" = "id",
 *     "label" = "label",
 *   },
 *   config_export = {
 *     "id",
 *     "agent_id",
 *     "tool_plugin_id",
 *     "label",
 *     "approval_required",
 *     "max_invocations",
 *   },
 * )
 */
class ToolBinding extends ConfigEntityBase {

  /**
   * The binding ID.
   */
  protected string $id;

  /**
   * The parent agent definition ID.
   */
  protected string $agent_id = '';

  /**
   * The Tool API plugin ID to bind.
   */
  protected string $tool_plugin_id = '';

  /**
   * Human-readable label.
   */
  protected string $label = '';

  /**
   * Whether this tool requires explicit approval per invocation.
   */
  protected bool $approval_required = FALSE;

  /**
   * Maximum invocations per run (NULL = unlimited).
   */
  protected ?int $max_invocations = NULL;

  /**
   * Gets the parent agent ID.
   */
  public function getAgentId(): string {
    return $this->agent_id;
  }

  /**
   * Gets the Tool API plugin ID.
   */
  public function getToolPluginId(): string {
    return $this->tool_plugin_id;
  }

  /**
   * Whether approval is required.
   */
  public function isApprovalRequired(): bool {
    return $this->approval_required;
  }

  /**
   * Gets the max invocations per run.
   */
  public function getMaxInvocations(): ?int {
    return $this->max_invocations;
  }

}
