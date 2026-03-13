<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Form;

use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Configure AI Agents Client settings.
 */
class ClientSettingsForm extends ConfigFormBase {

  /**
   * The entity type manager.
   *
   * @var \Drupal\Core\Entity\EntityTypeManagerInterface
   */
  protected EntityTypeManagerInterface $entityTypeManager;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    $instance = parent::create($container);
    $instance->entityTypeManager = $container->get('entity_type.manager');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  public function getFormId(): string {
    return 'ai_agents_client_settings';
  }

  /**
   * {@inheritdoc}
   */
  protected function getEditableConfigNames(): array {
    return ['ai_agents_client.settings'];
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state): array {
    $config = $this->config('ai_agents_client.settings');

    // -------------------------------------------------------------------------
    // Task queue (Advanced Queue).
    // -------------------------------------------------------------------------
    $queue_storage = $this->entityTypeManager->getStorage('advancedqueue_queue');
    $queues = $queue_storage->loadMultiple();
    $queue_options = ['' => $this->t('- Default (agent_tasks) -')];
    foreach ($queues as $id => $queue) {
      $queue_options[$id] = $queue->label() . ' (' . $id . ')';
    }

    $form['task_queue'] = [
      '#type' => 'details',
      '#title' => $this->t('Task Queue'),
      '#open' => FALSE,
      '#description' => $this->t('Advanced Queue used for agent tasks. Export config after changing so other environments get the same value (drush cex / drush cim).'),
    ];

    $form['task_queue']['task_queue_id'] = [
      '#type' => 'select',
      '#title' => $this->t('Agent tasks queue'),
      '#description' => $this->t('Queue where Submit Agent Task enqueues jobs. Create at <a href=":url">Configuration > System > Queues</a> if needed. Optional config <code>advancedqueue.advancedqueue_queue.agent_tasks</code> provides a default queue.', [
        ':url' => '/admin/config/system/queues',
      ]),
      '#options' => $queue_options,
      '#default_value' => $config->get('task_queue_id') ?? '',
    ];

    // -------------------------------------------------------------------------
    // Connection fieldset.
    // -------------------------------------------------------------------------
    $form['connection'] = [
      '#type' => 'details',
      '#title' => $this->t('Connection'),
      '#open' => TRUE,
    ];

    $form['connection']['gateway_url'] = [
      '#type' => 'url',
      '#title' => $this->t('LLM Gateway URL'),
      '#description' => $this->t('The base URL of the LLM gateway service.'),
      '#default_value' => $config->get('gateway_url'),
      '#maxlength' => 2048,
      '#required' => TRUE,
    ];

    $form['connection']['api_token'] = [
      '#type' => 'key_select',
      '#title' => $this->t('API Token Key'),
      '#description' => $this->t('Select the key that contains the API token for the gateway.'),
      '#default_value' => $config->get('api_token'),
    ];

    $form['connection']['client_id'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Client ID'),
      '#description' => $this->t('Unique identifier for this Drupal instance when communicating with the gateway.'),
      '#default_value' => $config->get('client_id'),
      '#maxlength' => 255,
    ];

    $form['connection']['timeout'] = [
      '#type' => 'number',
      '#title' => $this->t('Request Timeout'),
      '#description' => $this->t('Maximum time to wait for a response from mesh or fleet sites.'),
      '#default_value' => $config->get('timeout'),
      '#field_suffix' => $this->t('seconds'),
      '#min' => 1,
      '#max' => 300,
    ];

    $form['connection']['connect_timeout'] = [
      '#type' => 'number',
      '#title' => $this->t('Connection Timeout'),
      '#description' => $this->t('Maximum time to wait when establishing a connection.'),
      '#default_value' => $config->get('connect_timeout') ?: 10,
      '#field_suffix' => $this->t('seconds'),
      '#min' => 1,
      '#max' => 60,
    ];

    $form['connection']['heartbeat_interval'] = [
      '#type' => 'number',
      '#title' => $this->t('Heartbeat Interval'),
      '#description' => $this->t('How often to send a heartbeat to the gateway to confirm connectivity.'),
      '#default_value' => $config->get('heartbeat_interval'),
      '#field_suffix' => $this->t('seconds'),
      '#min' => 10,
      '#max' => 600,
    ];

    // -------------------------------------------------------------------------
    // Mesh & Fleet fieldset.
    // -------------------------------------------------------------------------
    $form['mesh'] = [
      '#type' => 'details',
      '#title' => $this->t('Mesh &amp; Fleet'),
      '#open' => TRUE,
      '#description' => $this->t('Configure the agent-mesh service URL for fleet management and agent discovery. Falls back to the AGENT_MESH_URL environment variable, then to the default public endpoint.'),
    ];

    $meshEnv = getenv('AGENT_MESH_URL');
    $mcpEnv = getenv('MCP_URL');

    $form['mesh']['mesh_url'] = [
      '#type' => 'url',
      '#title' => $this->t('Agent Mesh URL'),
      '#description' => $this->t('Base URL of the agent-mesh service for discovery and fleet management. Leave empty to use the AGENT_MESH_URL environment variable (@env_val) or default (https://mesh.blueflyagents.com).', [
        '@env_val' => $meshEnv ?: 'not set',
      ]),
      '#default_value' => $config->get('mesh_url'),
      '#maxlength' => 2048,
      '#placeholder' => $meshEnv ?: 'https://mesh.blueflyagents.com',
    ];

    $form['mesh']['mcp_url'] = [
      '#type' => 'url',
      '#title' => $this->t('MCP Protocol URL'),
      '#description' => $this->t('Base URL for the MCP protocol endpoint. Leave empty to use the MCP_URL environment variable (@env_val) or default (https://mcp.blueflyagents.com).', [
        '@env_val' => $mcpEnv ?: 'not set',
      ]),
      '#default_value' => $config->get('mcp_url'),
      '#maxlength' => 2048,
      '#placeholder' => $mcpEnv ?: 'https://mcp.blueflyagents.com',
    ];

    // -------------------------------------------------------------------------
    // Model defaults fieldset.
    // -------------------------------------------------------------------------
    $form['model'] = [
      '#type' => 'details',
      '#title' => $this->t('Model Defaults'),
      '#open' => FALSE,
    ];

    $form['model']['default_model'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Default LLM Model'),
      '#description' => $this->t('The default model identifier to use for requests (e.g. gpt-4o, claude-sonnet-4-20250514).'),
      '#default_value' => $config->get('default_model'),
      '#maxlength' => 255,
    ];

    $form['model']['max_tokens'] = [
      '#type' => 'number',
      '#title' => $this->t('Maximum Tokens'),
      '#description' => $this->t('Maximum number of tokens per request.'),
      '#default_value' => $config->get('max_tokens'),
      '#min' => 1,
      '#max' => 1000000,
    ];

    $form['model']['temperature'] = [
      '#type' => 'number',
      '#title' => $this->t('Temperature'),
      '#description' => $this->t('Controls randomness in model output. Lower values produce more deterministic results.'),
      '#default_value' => $config->get('temperature'),
      '#min' => 0,
      '#max' => 2,
      '#step' => 0.1,
    ];

    // -------------------------------------------------------------------------
    // Retry & Resilience fieldset.
    // -------------------------------------------------------------------------
    $form['resilience'] = [
      '#type' => 'details',
      '#title' => $this->t('Retry &amp; Resilience'),
      '#open' => FALSE,
    ];

    $form['resilience']['retry_attempts'] = [
      '#type' => 'number',
      '#title' => $this->t('Retry Attempts'),
      '#description' => $this->t('Number of times to retry a failed request before giving up.'),
      '#default_value' => $config->get('retry_attempts'),
      '#min' => 0,
      '#max' => 10,
    ];

    $form['resilience']['retry_base_delay'] = [
      '#type' => 'number',
      '#title' => $this->t('Retry Base Delay'),
      '#description' => $this->t('Initial delay before the first retry. Each subsequent retry doubles this value (exponential backoff with jitter).'),
      '#default_value' => $config->get('retry_base_delay') ?: 1000,
      '#field_suffix' => $this->t('ms'),
      '#min' => 100,
      '#max' => 30000,
    ];

    $form['resilience']['retry_max_delay'] = [
      '#type' => 'number',
      '#title' => $this->t('Retry Max Delay'),
      '#description' => $this->t('Maximum delay cap between retries. Exponential backoff will not exceed this value.'),
      '#default_value' => $config->get('retry_max_delay') ?: 30000,
      '#field_suffix' => $this->t('ms'),
      '#min' => 1000,
      '#max' => 120000,
    ];

    $form['resilience']['circuit_breaker_enabled'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable Circuit Breaker'),
      '#description' => $this->t('Automatically stop sending requests when the failure rate exceeds the threshold.'),
      '#default_value' => $config->get('circuit_breaker_enabled'),
    ];

    $form['resilience']['failure_threshold'] = [
      '#type' => 'number',
      '#title' => $this->t('Failure Threshold'),
      '#description' => $this->t('Percentage of failed requests that triggers the circuit breaker.'),
      '#default_value' => $config->get('failure_threshold'),
      '#field_suffix' => '%',
      '#min' => 1,
      '#max' => 100,
      '#states' => [
        'visible' => [
          ':input[name="circuit_breaker_enabled"]' => ['checked' => TRUE],
        ],
      ],
    ];

    $form['resilience']['recovery_timeout'] = [
      '#type' => 'number',
      '#title' => $this->t('Recovery Timeout'),
      '#description' => $this->t('Time to wait before attempting requests again after the circuit breaker trips.'),
      '#default_value' => $config->get('recovery_timeout'),
      '#field_suffix' => $this->t('seconds'),
      '#min' => 5,
      '#max' => 600,
      '#states' => [
        'visible' => [
          ':input[name="circuit_breaker_enabled"]' => ['checked' => TRUE],
        ],
      ],
    ];

    // -------------------------------------------------------------------------
    // Caching fieldset.
    // -------------------------------------------------------------------------
    $form['caching'] = [
      '#type' => 'details',
      '#title' => $this->t('Caching'),
      '#open' => FALSE,
    ];

    $form['caching']['cache_enabled'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable Response Caching'),
      '#description' => $this->t('Cache LLM responses to reduce costs and improve response time for repeated queries.'),
      '#default_value' => $config->get('cache_enabled'),
    ];

    $form['caching']['cache_ttl'] = [
      '#type' => 'number',
      '#title' => $this->t('Cache TTL'),
      '#description' => $this->t('How long cached responses remain valid.'),
      '#default_value' => $config->get('cache_ttl'),
      '#field_suffix' => $this->t('seconds'),
      '#min' => 60,
      '#max' => 86400,
      '#states' => [
        'visible' => [
          ':input[name="cache_enabled"]' => ['checked' => TRUE],
        ],
      ],
    ];

    // -------------------------------------------------------------------------
    // Rate Limiting fieldset.
    // -------------------------------------------------------------------------
    $form['rate_limiting'] = [
      '#type' => 'details',
      '#title' => $this->t('Rate Limiting'),
      '#open' => FALSE,
    ];

    $form['rate_limiting']['rate_limit'] = [
      '#type' => 'number',
      '#title' => $this->t('Rate Limit'),
      '#description' => $this->t('Maximum number of requests allowed per minute. Set to 0 for unlimited.'),
      '#default_value' => $config->get('rate_limit'),
      '#field_suffix' => $this->t('requests/min'),
      '#min' => 0,
      '#max' => 10000,
    ];

    // -------------------------------------------------------------------------
    // Monitoring fieldset.
    // -------------------------------------------------------------------------
    $form['monitoring'] = [
      '#type' => 'details',
      '#title' => $this->t('Monitoring'),
      '#open' => FALSE,
    ];

    $form['monitoring']['metrics_enabled'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable Metrics Collection'),
      '#description' => $this->t('Collect usage metrics such as request counts, latency, and token consumption.'),
      '#default_value' => $config->get('metrics_enabled'),
    ];

    $form['monitoring']['opentelemetry_enabled'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable OpenTelemetry'),
      '#description' => $this->t('Export traces and metrics via the OpenTelemetry protocol.'),
      '#default_value' => $config->get('opentelemetry_enabled'),
    ];

    $form['monitoring']['otel_endpoint'] = [
      '#type' => 'url',
      '#title' => $this->t('OpenTelemetry Endpoint'),
      '#description' => $this->t('The OTLP collector endpoint URL (e.g. http://collector:4318).'),
      '#default_value' => $config->get('otel_endpoint'),
      '#maxlength' => 2048,
      '#states' => [
        'visible' => [
          ':input[name="opentelemetry_enabled"]' => ['checked' => TRUE],
        ],
      ],
    ];

    $form['monitoring']['log_level'] = [
      '#type' => 'select',
      '#title' => $this->t('Log Level'),
      '#description' => $this->t('Minimum severity level for log messages.'),
      '#default_value' => $config->get('log_level'),
      '#options' => [
        'debug' => $this->t('Debug'),
        'info' => $this->t('Info'),
        'notice' => $this->t('Notice'),
        'warning' => $this->t('Warning'),
        'error' => $this->t('Error'),
        'critical' => $this->t('Critical'),
      ],
    ];

    // -------------------------------------------------------------------------
    // Budget fieldset.
    // -------------------------------------------------------------------------
    $form['budget'] = [
      '#type' => 'details',
      '#title' => $this->t('Budget Management'),
      '#open' => TRUE,
    ];

    $form['budget']['monthly_budget'] = [
      '#type' => 'number',
      '#title' => $this->t('Monthly Budget'),
      '#description' => $this->t('Maximum amount to spend on LLM requests per calendar month.'),
      '#default_value' => $config->get('monthly_budget'),
      '#field_prefix' => '$',
      '#step' => 0.01,
      '#min' => 0,
    ];

    $form['budget']['enforce_budget'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enforce Budget Limit'),
      '#description' => $this->t('When enabled, requests will be blocked once the monthly budget is exhausted.'),
      '#default_value' => $config->get('enforce_budget'),
    ];

    $form['budget']['alert_threshold'] = [
      '#type' => 'number',
      '#title' => $this->t('Alert Threshold'),
      '#description' => $this->t('Percentage of monthly budget consumed before an alert is triggered.'),
      '#default_value' => $config->get('alert_threshold'),
      '#field_suffix' => '%',
      '#min' => 1,
      '#max' => 100,
    ];

    $form['budget']['current_month_spend'] = [
      '#type' => 'number',
      '#title' => $this->t('Current Month Spend'),
      '#description' => $this->t('Total amount spent this calendar month. Reset automatically at month start.'),
      '#default_value' => $config->get('current_month_spend'),
      '#field_prefix' => '$',
      '#step' => 0.01,
      '#min' => 0,
      '#disabled' => TRUE,
    ];

    $form['budget']['last_reset_date'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Last Reset Date'),
      '#description' => $this->t('Date when the monthly spend counter was last reset.'),
      '#default_value' => $config->get('last_reset_date'),
      '#disabled' => TRUE,
    ];

    return parent::buildForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function validateForm(array &$form, FormStateInterface $form_state): void {
    parent::validateForm($form, $form_state);

    // Validate retry_base_delay <= retry_max_delay.
    $baseDelay = (int) $form_state->getValue('retry_base_delay');
    $maxDelay = (int) $form_state->getValue('retry_max_delay');
    if ($baseDelay > $maxDelay) {
      $form_state->setErrorByName('retry_base_delay', $this->t('Retry base delay must not exceed the maximum delay.'));
    }

    // Validate URLs are well-formed when provided.
    foreach (['mesh_url', 'mcp_url'] as $field) {
      $value = $form_state->getValue($field);
      if (!empty($value) && !filter_var($value, FILTER_VALIDATE_URL)) {
        $form_state->setErrorByName($field, $this->t('The @field must be a valid URL.', [
          '@field' => $field,
        ]));
      }
    }
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $this->config('ai_agents_client.settings')
      // Task queue.
      ->set('task_queue_id', $form_state->getValue('task_queue_id') ?? '')
      // Connection.
      ->set('gateway_url', $form_state->getValue('gateway_url'))
      ->set('api_token', $form_state->getValue('api_token'))
      ->set('client_id', $form_state->getValue('client_id'))
      ->set('timeout', (int) $form_state->getValue('timeout'))
      ->set('connect_timeout', (int) $form_state->getValue('connect_timeout'))
      ->set('heartbeat_interval', (int) $form_state->getValue('heartbeat_interval'))
      // Mesh & Fleet.
      ->set('mesh_url', $form_state->getValue('mesh_url') ?? '')
      ->set('mcp_url', $form_state->getValue('mcp_url') ?? '')
      // Model defaults.
      ->set('default_model', $form_state->getValue('default_model'))
      ->set('max_tokens', (int) $form_state->getValue('max_tokens'))
      ->set('temperature', (float) $form_state->getValue('temperature'))
      // Retry & Resilience.
      ->set('retry_attempts', (int) $form_state->getValue('retry_attempts'))
      ->set('retry_base_delay', (int) $form_state->getValue('retry_base_delay'))
      ->set('retry_max_delay', (int) $form_state->getValue('retry_max_delay'))
      ->set('circuit_breaker_enabled', (bool) $form_state->getValue('circuit_breaker_enabled'))
      ->set('failure_threshold', (int) $form_state->getValue('failure_threshold'))
      ->set('recovery_timeout', (int) $form_state->getValue('recovery_timeout'))
      // Caching.
      ->set('cache_enabled', (bool) $form_state->getValue('cache_enabled'))
      ->set('cache_ttl', (int) $form_state->getValue('cache_ttl'))
      // Rate Limiting.
      ->set('rate_limit', (int) $form_state->getValue('rate_limit'))
      // Monitoring.
      ->set('metrics_enabled', (bool) $form_state->getValue('metrics_enabled'))
      ->set('opentelemetry_enabled', (bool) $form_state->getValue('opentelemetry_enabled'))
      ->set('otel_endpoint', $form_state->getValue('otel_endpoint') ?? '')
      ->set('log_level', $form_state->getValue('log_level'))
      // Budget.
      ->set('monthly_budget', (float) $form_state->getValue('monthly_budget'))
      ->set('enforce_budget', (bool) $form_state->getValue('enforce_budget'))
      ->set('alert_threshold', (int) $form_state->getValue('alert_threshold'))
      ->save();

    parent::submitForm($form, $form_state);
  }

}
