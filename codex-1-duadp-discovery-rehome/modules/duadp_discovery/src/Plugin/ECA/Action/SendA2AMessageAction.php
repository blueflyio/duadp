<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\ECA\Action;

use Drupal\bluefly_agent_platform\Service\CommunicationClient;
use Drupal\Core\Action\Attribute\Action;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\eca\Attribute\EcaAction;
use Drupal\eca\Plugin\Action\ConfigurableActionBase;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * ECA action that sends an A2A message to a specific agent.
 *
 * Supports token replacement in target_agent_id, message_type, and payload
 * fields, allowing dynamic message construction based on ECA event context.
 * The JSON response from the target agent is stored as a token for use by
 * subsequent ECA actions.
 */
#[Action(
  id: 'ai_agents_communication_send_message',
  label: new TranslatableMarkup('A2A: Send message to agent'),
)]
#[EcaAction(
  description: new TranslatableMarkup('Send a message to a specific agent via the A2A communication protocol. Target agent, message type, and payload all support token replacement.'),
)]
class SendA2AMessageAction extends ConfigurableActionBase {

  /**
   * The A2A communication client.
   */
  protected CommunicationClient $communicationClient;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): static {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->communicationClient = $container->get('ai_agents_communication.client');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  public function execute(): void {
    $target_agent_id = trim($this->tokenService->replaceClear($this->configuration['target_agent_id']));
    $message_type = trim($this->tokenService->replaceClear($this->configuration['message_type']));
    $payload_raw = $this->tokenService->replaceClear($this->configuration['payload']);

    if ($target_agent_id === '' || $message_type === '') {
      $this->logger->error('A2A send action: target_agent_id and message_type are required.');
      return;
    }

    $payload = json_decode($payload_raw, TRUE);
    if ($payload === NULL && $payload_raw !== 'null') {
      // Not valid JSON -- wrap it as a message string.
      $payload = ['message' => $payload_raw];
    }

    $message = [
      'id' => uniqid('eca_msg_', TRUE),
      'type' => $message_type,
      'payload' => $payload,
    ];

    $response = $this->communicationClient->send($target_agent_id, $message);

    // Store the response as a token for downstream actions.
    $token_name = trim($this->configuration['token_result']);
    if ($token_name !== '') {
      $this->tokenService->addTokenData($token_name, $response);
    }

    if (isset($response['error'])) {
      $this->logger->warning('A2A send action to "@agent" returned error: @error', [
        '@agent' => $target_agent_id,
        '@error' => $response['error'],
      ]);
    }
  }

  /**
   * {@inheritdoc}
   */
  public function defaultConfiguration(): array {
    return [
      'target_agent_id' => '',
      'message_type' => 'task',
      'payload' => '{}',
      'token_result' => '',
    ] + parent::defaultConfiguration();
  }

  /**
   * {@inheritdoc}
   */
  public function buildConfigurationForm(array $form, FormStateInterface $form_state): array {
    $form['target_agent_id'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Target Agent ID'),
      '#default_value' => $this->configuration['target_agent_id'],
      '#description' => $this->t('The ID of the agent to send the message to. Supports token replacement.'),
      '#required' => TRUE,
      '#weight' => -40,
      '#eca_token_replacement' => TRUE,
    ];
    $form['message_type'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Message type'),
      '#default_value' => $this->configuration['message_type'],
      '#description' => $this->t('The message type (e.g., "task", "query", "ping", "notification"). Supports token replacement.'),
      '#required' => TRUE,
      '#weight' => -30,
      '#eca_token_replacement' => TRUE,
    ];
    $form['payload'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Payload (JSON)'),
      '#default_value' => $this->configuration['payload'],
      '#description' => $this->t('The message payload as JSON. Tokens in the JSON string will be replaced before sending. Example: {"task": "[event:message_type]", "data": "value"}'),
      '#weight' => -20,
      '#eca_token_replacement' => TRUE,
    ];
    $form['token_result'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Token name for result'),
      '#default_value' => $this->configuration['token_result'],
      '#description' => $this->t('Optionally store the response from the target agent in a token with this name for use in subsequent actions.'),
      '#weight' => -10,
      '#eca_token_reference' => TRUE,
    ];
    return parent::buildConfigurationForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function submitConfigurationForm(array &$form, FormStateInterface $form_state): void {
    $this->configuration['target_agent_id'] = $form_state->getValue('target_agent_id');
    $this->configuration['message_type'] = $form_state->getValue('message_type');
    $this->configuration['payload'] = $form_state->getValue('payload');
    $this->configuration['token_result'] = $form_state->getValue('token_result');
    parent::submitConfigurationForm($form, $form_state);
  }

}
