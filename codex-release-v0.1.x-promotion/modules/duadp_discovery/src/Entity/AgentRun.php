<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Entity;

use Drupal\Core\Entity\ContentEntityBase;
use Drupal\Core\Entity\EntityTypeInterface;
use Drupal\Core\Field\BaseFieldDefinition;

/**
 * Defines the Agent Run content entity.
 *
 * Tracks execution state: queued → running → waiting_approval → succeeded/failed/canceled.
 *
 * @ContentEntityType(
 *   id = "agent_run",
 *   label = @Translation("Agent run"),
 *   label_collection = @Translation("Agent runs"),
 *   label_singular = @Translation("agent run"),
 *   label_plural = @Translation("agent runs"),
 *   base_table = "agent_run",
 *   entity_keys = {
 *     "id" = "id",
 *     "uuid" = "uuid",
 *   },
 *   admin_permission = "administer agents",
 * )
 */
class AgentRun extends ContentEntityBase {

  /**
   * Run status constants.
   */
  public const STATUS_QUEUED = 'queued';
  public const STATUS_RUNNING = 'running';
  public const STATUS_WAITING_APPROVAL = 'waiting_approval';
  public const STATUS_SUCCEEDED = 'succeeded';
  public const STATUS_FAILED = 'failed';
  public const STATUS_CANCELED = 'canceled';

  /**
   * Approval state constants.
   */
  public const APPROVAL_NOT_REQUIRED = 'not_required';
  public const APPROVAL_PENDING = 'pending';
  public const APPROVAL_APPROVED = 'approved';
  public const APPROVAL_REJECTED = 'rejected';

  /**
   * Run kind constants.
   */
  public const KIND_AGENT_TASK = 'agent_task';
  public const KIND_FLOWDROP = 'flowdrop_workflow';
  public const KIND_DRUPALORG = 'drupalorg_issue_workflow';
  public const KIND_TOOL = 'tool_invocation';

  /**
   * {@inheritdoc}
   */
  public static function baseFieldDefinitions(EntityTypeInterface $entity_type): array {
    $fields = parent::baseFieldDefinitions($entity_type);

    $fields['correlation_id'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Correlation ID'))
      ->setDescription(t('Unique correlation identifier for tracing.'))
      ->setSetting('max_length', 36);

    $fields['status'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Status'))
      ->setDescription(t('Run status.'))
      ->setRequired(TRUE)
      ->setDefaultValue(self::STATUS_QUEUED)
      ->setSetting('max_length', 32);

    $fields['kind'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Kind'))
      ->setDescription(t('Run kind.'))
      ->setRequired(TRUE)
      ->setSetting('max_length', 64);

    $fields['agent_id'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Agent ID'))
      ->setDescription(t('Agent definition machine name.'))
      ->setSetting('max_length', 255);

    $fields['flow_id'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Flow ID'))
      ->setDescription(t('Workflow flow ID.'))
      ->setSetting('max_length', 255);

    $fields['workspace_id'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Workspace ID'))
      ->setDescription(t('Multi-tenant workspace boundary.'))
      ->setSetting('max_length', 255);

    $fields['input'] = BaseFieldDefinition::create('string_long')
      ->setLabel(t('Input'))
      ->setDescription(t('JSON-encoded input payload.'));

    $fields['output'] = BaseFieldDefinition::create('string_long')
      ->setLabel(t('Output'))
      ->setDescription(t('JSON-encoded output data.'));

    $fields['approval_state'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Approval state'))
      ->setDefaultValue(self::APPROVAL_NOT_REQUIRED)
      ->setSetting('max_length', 32);

    $fields['provider'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Provider'))
      ->setDescription(t('Model provider used.'))
      ->setSetting('max_length', 64);

    $fields['cost_tokens'] = BaseFieldDefinition::create('integer')
      ->setLabel(t('Cost tokens'))
      ->setDescription(t('Estimated token usage.'));

    $fields['cost_provider'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Cost provider'))
      ->setSetting('max_length', 64);

    $fields['error'] = BaseFieldDefinition::create('string_long')
      ->setLabel(t('Error'))
      ->setDescription(t('Error message if failed.'));

    $fields['retry_count'] = BaseFieldDefinition::create('integer')
      ->setLabel(t('Retry count'))
      ->setDefaultValue(0);

    $fields['started_at'] = BaseFieldDefinition::create('timestamp')
      ->setLabel(t('Started at'));

    $fields['finished_at'] = BaseFieldDefinition::create('timestamp')
      ->setLabel(t('Finished at'));

    $fields['created'] = BaseFieldDefinition::create('created')
      ->setLabel(t('Created'));

    $fields['changed'] = BaseFieldDefinition::create('changed')
      ->setLabel(t('Changed'));

    return $fields;
  }

  /**
   * Gets the run status.
   */
  public function getStatus(): string {
    return $this->get('status')->value ?? self::STATUS_QUEUED;
  }

  /**
   * Sets the run status.
   */
  public function setStatus(string $status): static {
    $this->set('status', $status);
    return $this;
  }

  /**
   * Gets the correlation ID.
   */
  public function getCorrelationId(): ?string {
    return $this->get('correlation_id')->value;
  }

  /**
   * Gets the agent ID.
   */
  public function getAgentId(): ?string {
    return $this->get('agent_id')->value;
  }

  /**
   * Gets the input as decoded array.
   *
   * @return array<string, mixed>
   *   The decoded input.
   */
  public function getInputDecoded(): array {
    $raw = $this->get('input')->value;
    if (empty($raw)) {
      return [];
    }
    $decoded = json_decode($raw, TRUE);
    return is_array($decoded) ? $decoded : [];
  }

  /**
   * Gets the output as decoded array.
   *
   * @return array<string, mixed>|null
   *   The decoded output Data.
   */
  public function getOutputDecoded(): ?array {
    $raw = $this->get('output')->value;
    if (empty($raw)) {
      return NULL;
    }
    $decoded = json_decode($raw, TRUE);
    return is_array($decoded) ? $decoded : NULL;
  }

}
