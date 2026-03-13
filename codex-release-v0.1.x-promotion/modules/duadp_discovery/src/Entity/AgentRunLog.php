<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Entity;

use Drupal\Core\Entity\ContentEntityBase;
use Drupal\Core\Entity\EntityTypeInterface;
use Drupal\Core\Field\BaseFieldDefinition;

/**
 * Defines the Agent Run Log content entity.
 *
 * Append-only log entries per run: tool calls, decisions, errors, approvals.
 *
 * @ContentEntityType(
 *   id = "agent_run_log",
 *   label = @Translation("Agent run log"),
 *   label_collection = @Translation("Agent run logs"),
 *   base_table = "agent_run_log",
 *   entity_keys = {
 *     "id" = "id",
 *     "uuid" = "uuid",
 *   },
 *   admin_permission = "administer agents",
 * )
 */
class AgentRunLog extends ContentEntityBase {

  /**
   * Log level constants.
   */
  public const LEVEL_DEBUG = 'debug';
  public const LEVEL_INFO = 'info';
  public const LEVEL_WARN = 'warn';
  public const LEVEL_ERROR = 'error';

  /**
   * {@inheritdoc}
   */
  public static function baseFieldDefinitions(EntityTypeInterface $entity_type): array {
    $fields = parent::baseFieldDefinitions($entity_type);

    $fields['run_id'] = BaseFieldDefinition::create('entity_reference')
      ->setLabel(t('Run'))
      ->setDescription(t('The parent agent run.'))
      ->setRequired(TRUE)
      ->setSetting('target_type', 'agent_run');

    $fields['seq'] = BaseFieldDefinition::create('integer')
      ->setLabel(t('Sequence'))
      ->setDescription(t('Monotonic sequence number within the run.'))
      ->setRequired(TRUE);

    $fields['level'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Level'))
      ->setRequired(TRUE)
      ->setDefaultValue(self::LEVEL_INFO)
      ->setSetting('max_length', 16);

    $fields['message'] = BaseFieldDefinition::create('string_long')
      ->setLabel(t('Message'))
      ->setRequired(TRUE);

    $fields['tool_call'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Tool call'))
      ->setDescription(t('Tool plugin ID if this log is from a tool invocation.'))
      ->setSetting('max_length', 255);

    $fields['approval_event'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Approval event'))
      ->setDescription(t('Approval event type (requested, approved, rejected).'))
      ->setSetting('max_length', 32);

    $fields['metadata'] = BaseFieldDefinition::create('string_long')
      ->setLabel(t('Metadata'))
      ->setDescription(t('JSON-encoded metadata.'));

    $fields['created'] = BaseFieldDefinition::create('created')
      ->setLabel(t('Created'));

    return $fields;
  }

  /**
   * Gets the sequence number.
   */
  public function getSeq(): int {
    return (int) $this->get('seq')->value;
  }

  /**
   * Gets the log level.
   */
  public function getLevel(): string {
    return $this->get('level')->value ?? self::LEVEL_INFO;
  }

  /**
   * Gets the log message.
   */
  public function getMessage(): string {
    return $this->get('message')->value ?? '';
  }

}
