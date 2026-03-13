<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\ECA\Action;

use Drupal\bluefly_agent_platform\Service\AgentRegistry;
use Drupal\bluefly_agent_platform\Service\CommunicationClient;
use Drupal\Core\Action\Attribute\Action;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\eca\Attribute\EcaAction;
use Drupal\eca\Plugin\Action\ConfigurableActionBase;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * ECA action that broadcasts an A2A message to multiple agents.
 *
 * Supports targeting by capability (all agents with a matching capability)
 * or by explicit comma-separated agent IDs. The broadcast results are stored
 * as a token for downstream consumption.
 */
#[Action(
  id: 'ai_agents_communication_broadcast',
  label: new TranslatableMarkup('A2A: Broadcast message to agents'),
)]
#[EcaAction(
  description: new TranslatableMarkup('Broadcast a message to multiple agents. Target by capability filter or explicit agent ID list. Payload supports token replacement.'),
)]
class BroadcastA2AAction extends ConfigurableActionBase {

  /**
   * The A2A communication client.
   */
  protected CommunicationClient $communicationClient;

  /**
   * The agent registry.
   */
  protected AgentRegistry $agentRegistry;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): static {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->communicationClient = $container->get('ai_agents_communication.client');
    $instance->agentRegistry = $container->get('ai_agents_communication.registry');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  public function execute(): void {
    $capability = trim($this->tokenService->replaceClear($this->configuration['target_capability']));
    $agent_ids_raw = trim($this->tokenService->replaceClear($this->configuration['agent_ids']));
    $message_raw = $this->tokenService->replaceClear($this->configuration['message']);

    $payload = json_decode($message_raw, TRUE);
    if ($payload === NULL && $message_raw !== 'null') {
      $payload = ['message' => $message_raw];
    }

    // Resolve target agent IDs.
    $target_ids = [];

    if ($agent_ids_raw !== '') {
      $target_ids = array_map('trim', explode(',', $agent_ids_raw));
      $target_ids = array_filter($target_ids, static fn($id) => $id !== '');
    }

    if ($capability !== '') {
      // Discover all active agents and filter by capability.
      $all_agents = $this->agentRegistry->discover();
      foreach ($all_agents as $agent) {
        $caps = $agent['capabilities'] ?? [];
        if (is_array($caps) && in_array($capability, $caps, TRUE)) {
          $agent_id = $agent['agent_id'] ?? '';
          if ($agent_id !== '' && !in_array($agent_id, $target_ids, TRUE)) {
            $target_ids[] = $agent_id;
          }
        }
      }
    }

    if (empty($target_ids)) {
      $this->logger->warning('A2A broadcast action: no target agents resolved (capability: "@cap", ids: "@ids").', [
        '@cap' => $capability,
        '@ids' => $agent_ids_raw,
      ]);
      return;
    }

    $message = [
      'id' => uniqid('eca_bcast_', TRUE),
      'type' => 'broadcast',
      'payload' => $payload,
    ];

    $responses = $this->communicationClient->broadcast($target_ids, $message);

    // Store the results as a token.
    $token_name = trim($this->configuration['token_result']);
    if ($token_name !== '') {
      $this->tokenService->addTokenData($token_name, [
        'broadcast_id' => $message['id'],
        'recipients' => count($target_ids),
        'target_ids' => $target_ids,
        'responses' => $responses,
      ]);
    }
  }

  /**
   * {@inheritdoc}
   */
  public function defaultConfiguration(): array {
    return [
      'target_capability' => '',
      'agent_ids' => '',
      'message' => '{}',
      'token_result' => '',
    ] + parent::defaultConfiguration();
  }

  /**
   * {@inheritdoc}
   */
  public function buildConfigurationForm(array $form, FormStateInterface $form_state): array {
    $form['target_capability'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Target capability'),
      '#default_value' => $this->configuration['target_capability'],
      '#description' => $this->t('Broadcast to all active agents that have this capability (e.g., "chat", "code_review"). Supports token replacement. Leave empty to use explicit agent IDs only.'),
      '#weight' => -40,
      '#eca_token_replacement' => TRUE,
    ];
    $form['agent_ids'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Agent IDs (comma-separated)'),
      '#default_value' => $this->configuration['agent_ids'],
      '#description' => $this->t('Explicit comma-separated list of target agent IDs. Combined with capability filter if both are provided. Supports token replacement.'),
      '#weight' => -30,
      '#eca_token_replacement' => TRUE,
    ];
    $form['message'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Message payload (JSON)'),
      '#default_value' => $this->configuration['message'],
      '#description' => $this->t('The broadcast message payload as JSON. Tokens are replaced before sending.'),
      '#required' => TRUE,
      '#weight' => -20,
      '#eca_token_replacement' => TRUE,
    ];
    $form['token_result'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Token name for result'),
      '#default_value' => $this->configuration['token_result'],
      '#description' => $this->t('Optionally store the broadcast result (recipients, responses) in a token with this name.'),
      '#weight' => -10,
      '#eca_token_reference' => TRUE,
    ];
    return parent::buildConfigurationForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function submitConfigurationForm(array &$form, FormStateInterface $form_state): void {
    $this->configuration['target_capability'] = $form_state->getValue('target_capability');
    $this->configuration['agent_ids'] = $form_state->getValue('agent_ids');
    $this->configuration['message'] = $form_state->getValue('message');
    $this->configuration['token_result'] = $form_state->getValue('token_result');
    parent::submitConfigurationForm($form, $form_state);
  }

}
