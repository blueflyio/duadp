<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\ECA\Condition;

use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\eca\Attribute\EcaCondition;
use Drupal\eca\Plugin\ECA\Condition\ConditionBase;
use Drupal\bluefly_agent_platform\Event\GatewayTaskEvent;

/**
 * ECA condition to check gateway task status.
 */
#[EcaCondition(
  id: 'ai_agents_client_task_status',
  label: new TranslatableMarkup('Gateway: Task status'),
  description: new TranslatableMarkup('Evaluates the status of a gateway task (successful, failed, has result, matches task type).'),
  version_introduced: '1.0.0',
)]
class GatewayTaskStatusCondition extends ConditionBase {

  /**
   * {@inheritdoc}
   */
  public function defaultConfiguration(): array {
    return [
      'status_check' => 'successful',
      'task_type_match' => '',
    ] + parent::defaultConfiguration();
  }

  /**
   * {@inheritdoc}
   */
  public function buildConfigurationForm(array $form, FormStateInterface $form_state): array {
    $form = parent::buildConfigurationForm($form, $form_state);

    $form['status_check'] = [
      '#type' => 'select',
      '#title' => $this->t('Status check'),
      '#options' => [
        'successful' => $this->t('Task was successful'),
        'failed' => $this->t('Task failed'),
        'has_result' => $this->t('Task has a result'),
        'task_type' => $this->t('Task type matches'),
      ],
      '#default_value' => $this->configuration['status_check'],
      '#required' => TRUE,
    ];

    $form['task_type_match'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Task type to match'),
      '#default_value' => $this->configuration['task_type_match'],
      '#description' => $this->t('Only used when status check is "Task type matches". Supports token replacement.'),
      '#eca_token_replacement' => TRUE,
      '#states' => [
        'visible' => [
          ':input[name="status_check"]' => ['value' => 'task_type'],
        ],
      ],
    ];

    return $form;
  }

  /**
   * {@inheritdoc}
   */
  public function submitConfigurationForm(array &$form, FormStateInterface $form_state): void {
    $this->configuration['status_check'] = $form_state->getValue('status_check');
    $this->configuration['task_type_match'] = $form_state->getValue('task_type_match');
    parent::submitConfigurationForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function evaluate(): bool {
    $event = $this->event ?? NULL;

    if (!$event instanceof GatewayTaskEvent) {
      return $this->negationCheck(FALSE);
    }

    $result = match ($this->configuration['status_check']) {
      'successful' => $event->isSuccessful(),
      'failed' => !$event->isSuccessful(),
      'has_result' => $event->getResult() !== NULL,
      'task_type' => $event->getTaskType() === $this->tokenService->replace($this->configuration['task_type_match']),
      default => FALSE,
    };

    return $this->negationCheck($result);
  }

}
