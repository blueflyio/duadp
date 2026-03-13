<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\ECA\Action;

use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Core\Action\Attribute\Action;
use Drupal\eca\Attribute\EcaAction;
use Drupal\eca\Plugin\Action\ConfigurableActionBase;
use Drupal\bluefly_agent_platform\Service\ClientService;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * ECA action to dispatch a task to the OSSA gateway.
 */
#[Action(
  id: 'ai_agents_client_dispatch_task',
  label: new TranslatableMarkup('Dispatch gateway task'),
)]
#[EcaAction(
  description: new TranslatableMarkup('Dispatch a task to the OSSA-compliant agent gateway for processing.'),
  version_introduced: '1.0.0',
)]
class DispatchGatewayTaskAction extends ConfigurableActionBase {

  /**
   * The client gateway service.
   */
  protected ClientService $clientService;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): static {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->clientService = $container->get('ai_agents_client.gateway');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  public function defaultConfiguration(): array {
    return [
      'task_type' => '',
      'agent_id' => '',
      'payload' => '{}',
      'async' => TRUE,
      'token_result' => '',
    ] + parent::defaultConfiguration();
  }

  /**
   * {@inheritdoc}
   */
  public function buildConfigurationForm(array $form, FormStateInterface $form_state): array {
    $form = parent::buildConfigurationForm($form, $form_state);

    $form['task_type'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Task type'),
      '#default_value' => $this->configuration['task_type'],
      '#required' => TRUE,
      '#description' => $this->t('The type of task to dispatch (e.g., chat, analysis, code_review).'),
      '#eca_token_replacement' => TRUE,
    ];

    $form['agent_id'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Agent ID'),
      '#default_value' => $this->configuration['agent_id'],
      '#description' => $this->t('The target agent ID. Leave empty for automatic routing.'),
      '#eca_token_replacement' => TRUE,
    ];

    $form['payload'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Task payload (JSON)'),
      '#default_value' => $this->configuration['payload'],
      '#description' => $this->t('The JSON payload to send with the task. Supports token replacement.'),
      '#required' => TRUE,
      '#eca_token_replacement' => TRUE,
    ];

    $form['async'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Dispatch asynchronously'),
      '#default_value' => $this->configuration['async'],
      '#description' => $this->t('Queue the task for background processing instead of waiting for a response.'),
    ];

    $form['token_result'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Token name for result'),
      '#default_value' => $this->configuration['token_result'],
      '#description' => $this->t('The token name to store the task result or task ID.'),
      '#eca_token_reference' => TRUE,
    ];

    return $form;
  }

  /**
   * {@inheritdoc}
   */
  public function submitConfigurationForm(array &$form, FormStateInterface $form_state): void {
    $this->configuration['task_type'] = $form_state->getValue('task_type');
    $this->configuration['agent_id'] = $form_state->getValue('agent_id');
    $this->configuration['payload'] = $form_state->getValue('payload');
    $this->configuration['async'] = (bool) $form_state->getValue('async');
    $this->configuration['token_result'] = $form_state->getValue('token_result');
    parent::submitConfigurationForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function execute(mixed $entity = NULL): void {
    $taskType = $this->tokenService->replace($this->configuration['task_type']);
    $agentId = $this->tokenService->replace($this->configuration['agent_id']);
    $payloadJson = $this->tokenService->replace($this->configuration['payload']);

    try {
      $payload = json_decode($payloadJson, TRUE, 512, JSON_THROW_ON_ERROR);
    }
    catch (\JsonException $e) {
      $this->logger->error('Invalid JSON payload for gateway task: @message', [
        '@message' => $e->getMessage(),
      ]);
      return;
    }

    try {
      $taskData = [
        'type' => $taskType,
        'agent_id' => $agentId,
        'payload' => $payload,
        'async' => $this->configuration['async'],
      ];

      $result = $this->clientService->dispatchTask($taskData);

      if (!empty($this->configuration['token_result'])) {
        $this->tokenService->addTokenData(
          $this->configuration['token_result'],
          is_array($result) ? json_encode($result) : (string) $result
        );
      }
    }
    catch (\Exception $e) {
      $this->logger->error('Gateway task dispatch failed: @message', [
        '@message' => $e->getMessage(),
      ]);
      if (!empty($this->configuration['token_result'])) {
        $this->tokenService->addTokenData(
          $this->configuration['token_result'],
          ''
        );
      }
    }
  }

}
