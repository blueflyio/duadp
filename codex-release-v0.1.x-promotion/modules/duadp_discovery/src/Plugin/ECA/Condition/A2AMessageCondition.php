<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\ECA\Condition;

use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\eca\Attribute\EcaCondition;
use Drupal\eca\Plugin\ECA\Condition\ConditionBase;
use Drupal\bluefly_agent_platform\Event\A2AAgentEvent;
use Drupal\bluefly_agent_platform\Event\A2AMessageEvent;

/**
 * ECA condition that evaluates properties of A2A communication events.
 *
 * Supports four evaluation modes:
 * - message_type_matches: Check if the message type matches a given value.
 * - agent_type_matches: Check if the agent type matches a given value.
 * - delivery_successful: Check if message delivery was successful.
 * - has_response: Check if a response was received from the target agent.
 *
 * The condition supports negation via the standard ECA "Negate" checkbox.
 */
#[EcaCondition(
  id: 'ai_agents_communication_message_condition',
  label: new TranslatableMarkup('A2A: Message condition'),
  description: new TranslatableMarkup('Evaluate properties of an A2A communication event: message type, agent type, delivery success, or response presence.'),
)]
class A2AMessageCondition extends ConditionBase {

  /**
   * Available evaluation modes.
   */
  protected const MODE_MESSAGE_TYPE = 'message_type_matches';
  protected const MODE_AGENT_TYPE = 'agent_type_matches';
  protected const MODE_DELIVERY_SUCCESS = 'delivery_successful';
  protected const MODE_HAS_RESPONSE = 'has_response';

  /**
   * {@inheritdoc}
   */
  public function evaluate(): bool {
    $event = $this->getEvent();
    $mode = $this->configuration['evaluation_mode'];
    $compare_value = trim($this->tokenService->replaceClear($this->configuration['compare_value']));

    $result = FALSE;

    switch ($mode) {
      case self::MODE_MESSAGE_TYPE:
        if ($event instanceof A2AMessageEvent) {
          $result = $compare_value !== '' && $event->getMessageType() === $compare_value;
        }
        break;

      case self::MODE_AGENT_TYPE:
        if ($event instanceof A2AAgentEvent) {
          $result = $compare_value !== '' && $event->getAgentType() === $compare_value;
        }
        break;

      case self::MODE_DELIVERY_SUCCESS:
        if ($event instanceof A2AMessageEvent) {
          $result = $event->isSuccessful();
        }
        break;

      case self::MODE_HAS_RESPONSE:
        if ($event instanceof A2AMessageEvent) {
          $result = $event->hasResponse();
        }
        break;
    }

    return $this->negationCheck($result);
  }

  /**
   * {@inheritdoc}
   */
  public function defaultConfiguration(): array {
    return [
      'evaluation_mode' => self::MODE_MESSAGE_TYPE,
      'compare_value' => '',
    ] + parent::defaultConfiguration();
  }

  /**
   * {@inheritdoc}
   */
  public function buildConfigurationForm(array $form, FormStateInterface $form_state): array {
    $form['evaluation_mode'] = [
      '#type' => 'select',
      '#title' => $this->t('Evaluation mode'),
      '#default_value' => $this->configuration['evaluation_mode'],
      '#options' => [
        self::MODE_MESSAGE_TYPE => $this->t('Message type matches'),
        self::MODE_AGENT_TYPE => $this->t('Agent type matches'),
        self::MODE_DELIVERY_SUCCESS => $this->t('Delivery was successful'),
        self::MODE_HAS_RESPONSE => $this->t('Has response from target'),
      ],
      '#description' => $this->t('Select what property of the A2A event to evaluate.'),
      '#weight' => -30,
    ];
    $form['compare_value'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Comparison value'),
      '#default_value' => $this->configuration['compare_value'],
      '#description' => $this->t('The value to compare against. Used by "message type matches" (e.g., "task", "query") and "agent type matches" (e.g., "ossa", "mcp"). Not used by "delivery successful" or "has response". Supports token replacement.'),
      '#weight' => -20,
      '#eca_token_replacement' => TRUE,
    ];
    return parent::buildConfigurationForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function submitConfigurationForm(array &$form, FormStateInterface $form_state): void {
    $this->configuration['evaluation_mode'] = $form_state->getValue('evaluation_mode');
    $this->configuration['compare_value'] = $form_state->getValue('compare_value');
    parent::submitConfigurationForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function getCacheContexts(): array {
    return [];
  }

  /**
   * {@inheritdoc}
   */
  public function getCacheTags(): array {
    return [];
  }

  /**
   * {@inheritdoc}
   */
  public function getCacheMaxAge(): int {
    return 0;
  }

}
