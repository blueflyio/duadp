<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Entity;

use Drupal\Core\Config\Entity\ConfigEntityBase;

/**
 * Defines the Approval Policy config entity.
 *
 * Defines human-in-the-loop policies per operation type.
 *
 * @ConfigEntityType(
 *   id = "approval_policy",
 *   label = @Translation("Approval policy"),
 *   label_collection = @Translation("Approval policies"),
 *   handlers = {
 *     "form" = {
 *       "delete" = "Drupal\Core\Entity\EntityDeleteForm",
 *     },
 *   },
 *   config_prefix = "approval_policy",
 *   admin_permission = "administer agents",
 *   entity_keys = {
 *     "id" = "id",
 *     "label" = "label",
 *   },
 *   config_export = {
 *     "id",
 *     "label",
 *     "default_level",
 *     "rules",
 *   },
 * )
 */
class ApprovalPolicy extends ConfigEntityBase {

  /**
   * Approval levels.
   */
  public const LEVEL_AUTO = 'auto';
  public const LEVEL_REVIEW = 'review';
  public const LEVEL_EXPLICIT = 'explicit';
  public const LEVEL_DENY = 'deny';

  /**
   * The policy ID.
   */
  protected string $id;

  /**
   * Human-readable label.
   */
  protected string $label = '';

  /**
   * Default approval level for unmatched operations.
   */
  protected string $default_level = self::LEVEL_REVIEW;

  /**
   * Rules: array of {'operation' => string, 'level' => string}.
   *
   * @var array<int, array{operation: string, level: string}>
   */
  protected array $rules = [];

  /**
   * Gets the default approval level.
   */
  public function getDefaultLevel(): string {
    return $this->default_level;
  }

  /**
   * Gets the approval rules.
   *
   * @return array<int, array{operation: string, level: string}>
   *   The approval rules.
   */
  public function getRules(): array {
    return $this->rules;
  }

  /**
   * Gets the approval level for a given operation.
   */
  public function getLevelForOperation(string $operation): string {
    foreach ($this->rules as $rule) {
      if (isset($rule['operation']) && $rule['operation'] === $operation) {
        return $rule['level'] ?? $this->default_level;
      }
    }
    return $this->default_level;
  }

}
