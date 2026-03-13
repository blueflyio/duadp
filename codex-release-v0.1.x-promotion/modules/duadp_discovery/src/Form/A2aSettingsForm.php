<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Form;

use Drupal\bluefly_agent_platform\Service\AgentCardBuilder;
use Drupal\bluefly_agent_platform\Service\PlatformEndpointResolver;
use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\key\KeyRepositoryInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Configuration form for A2A Protocol settings.
 */
class A2aSettingsForm extends ConfigFormBase {

  /**
   * The agent card builder.
   */
  protected AgentCardBuilder $agentCardBuilder;

  /**
   * The key repository.
   */
  protected ?KeyRepositoryInterface $keyRepository = NULL;

  /**
   * The platform endpoint resolver.
   */
  protected PlatformEndpointResolver $endpointResolver;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    $instance = parent::create($container);
    $instance->agentCardBuilder = $container->get('ai_agents_communication.agent_card_builder');
    if ($container->has('key.repository')) {
      $instance->keyRepository = $container->get('key.repository');
    }
    $instance->endpointResolver = $container->get('ai_agents_communication.platform_endpoint_resolver');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  protected function getEditableConfigNames(): array {
    return ['ai_agents_communication.settings'];
  }

  /**
   * {@inheritdoc}
   */
  public function getFormId(): string {
    return 'ai_agents_communication_settings';
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state): array {
    $config = $this->config('ai_agents_communication.settings');

    $form['agent_card'] = [
      '#type' => 'details',
      '#title' => $this->t('Agent Card'),
      '#open' => TRUE,
    ];

    $form['agent_card']['agent_name'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Agent name'),
      '#description' => $this->t('Human-readable name for this agent in the A2A Agent Card.'),
      '#default_value' => $config->get('agent_name'),
      '#required' => TRUE,
    ];

    $form['agent_card']['agent_description'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Agent description'),
      '#description' => $this->t('Description of what this agent can do.'),
      '#default_value' => $config->get('agent_description'),
      '#rows' => 3,
    ];

    $form['agent_card']['agent_version'] = [
      '#type' => 'textfield',
      '#title' => $this->t('A2A version'),
      '#default_value' => $config->get('agent_version'),
      '#required' => TRUE,
    ];

    $form['provider'] = [
      '#type' => 'details',
      '#title' => $this->t('Provider'),
      '#open' => FALSE,
    ];

    $form['provider']['provider_organization'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Organization'),
      '#default_value' => $config->get('provider_organization'),
    ];

    $form['provider']['provider_url'] = [
      '#type' => 'url',
      '#title' => $this->t('Provider URL'),
      '#default_value' => $config->get('provider_url'),
    ];

    $form['authentication'] = [
      '#type' => 'details',
      '#title' => $this->t('Authentication'),
      '#open' => TRUE,
    ];

    $keys = [];
    if ($this->keyRepository) {
      foreach ($this->keyRepository->getKeys() as $key) {
        $keys[$key->id()] = $key->label();
      }
    }

    $form['authentication']['auth_key_id'] = [
      '#type' => 'select',
      '#title' => $this->t('Authentication key'),
      '#description' => $this->t('Select a Key module key for Bearer token authentication on the /a2a endpoint.'),
      '#options' => ['' => $this->t('- None -')] + $keys,
      '#default_value' => $config->get('auth_key_id'),
    ];

    $form['agents'] = [
      '#type' => 'details',
      '#title' => $this->t('Exposed Agents'),
      '#open' => TRUE,
    ];

    $availableAgents = $this->agentCardBuilder->getAvailableAgents();
    $form['agents']['exposed_agents'] = [
      '#type' => 'checkboxes',
      '#title' => $this->t('Agents to expose via A2A'),
      '#description' => $this->t('Select which AI agents to expose. Leave empty to expose all available agents.'),
      '#options' => $availableAgents,
      '#default_value' => $config->get('exposed_agents') ?: [],
    ];

    // Platform Infrastructure fieldset.
    $form['platform'] = [
      '#type' => 'details',
      '#title' => $this->t('Platform Infrastructure'),
      '#description' => $this->t('Configure endpoint URLs for your A2A collector, agent mesh, and MCP. Resolution order: environment variable (if set) > saved config below. Leave URLs empty to disable those features.'),
      '#open' => TRUE,
    ];

    $defaults = PlatformEndpointResolver::getDefaults();
    $envMap = PlatformEndpointResolver::getEnvMap();

    $form['platform']['a2a_collector_url'] = [
      '#type' => 'url',
      '#title' => $this->t('A2A Collector URL'),
      '#description' => $this->t('Base URL of the A2A log collector (e.g. for observability). POST /a2a/log will be used. Leave empty to disable forwarding. Env override: <code>@env</code>', [
        '@env' => $envMap['a2a_collector_url'],
      ]),
      '#default_value' => $config->get('platform.a2a_collector_url') ?? $defaults['a2a_collector_url'],
      '#attributes' => ['placeholder' => 'https://a2a-collector.example.com'],
    ];

    $envOverride = getenv($envMap['a2a_collector_url']);
    if ($envOverride !== FALSE && $envOverride !== '') {
      $form['platform']['a2a_collector_url']['#description'] .= '<br>' . $this->t('<strong>Currently overridden by env:</strong> <code>@value</code>', [
        '@value' => $envOverride,
      ]);
    }

    $form['platform']['a2a_stream_url'] = [
      '#type' => 'url',
      '#title' => $this->t('A2A Stream URL'),
      '#description' => $this->t('URL for the A2A event stream (SSE). Leave empty to disable. Env override: <code>@env</code>', [
        '@env' => $envMap['a2a_stream_url'],
      ]),
      '#default_value' => $config->get('platform.a2a_stream_url') ?? $defaults['a2a_stream_url'],
      '#attributes' => ['placeholder' => 'https://a2a-stream.example.com/a2a/stream'],
    ];

    $envOverride = getenv($envMap['a2a_stream_url']);
    if ($envOverride !== FALSE && $envOverride !== '') {
      $form['platform']['a2a_stream_url']['#description'] .= '<br>' . $this->t('<strong>Currently overridden by env:</strong> <code>@value</code>', [
        '@value' => $envOverride,
      ]);
    }

    $form['platform']['mesh_url'] = [
      '#type' => 'url',
      '#title' => $this->t('Agent Mesh URL'),
      '#description' => $this->t('URL for the agent discovery/coordination API. Leave empty to disable mesh discovery. Env override: <code>@env</code>', [
        '@env' => $envMap['mesh_url'],
      ]),
      '#default_value' => $config->get('platform.mesh_url') ?? $defaults['mesh_url'],
      '#attributes' => ['placeholder' => 'https://mesh.example.com'],
    ];

    $envOverride = getenv($envMap['mesh_url']);
    if ($envOverride !== FALSE && $envOverride !== '') {
      $form['platform']['mesh_url']['#description'] .= '<br>' . $this->t('<strong>Currently overridden by env:</strong> <code>@value</code>', [
        '@value' => $envOverride,
      ]);
    }

    $form['platform']['mcp_url'] = [
      '#type' => 'url',
      '#title' => $this->t('MCP URL'),
      '#description' => $this->t('URL for the Model Context Protocol SSE endpoint. Leave empty to disable. Env override: <code>@env</code>', [
        '@env' => $envMap['mcp_url'],
      ]),
      '#default_value' => $config->get('platform.mcp_url') ?? $defaults['mcp_url'],
      '#attributes' => ['placeholder' => 'https://mcp.example.com/api/mcp/sse'],
    ];

    $envOverride = getenv($envMap['mcp_url']);
    if ($envOverride !== FALSE && $envOverride !== '') {
      $form['platform']['mcp_url']['#description'] .= '<br>' . $this->t('<strong>Currently overridden by env:</strong> <code>@value</code>', [
        '@value' => $envOverride,
      ]);
    }

    $form['platform']['connection_timeout'] = [
      '#type' => 'number',
      '#title' => $this->t('Connection timeout'),
      '#description' => $this->t('HTTP connection timeout in seconds for platform API calls.'),
      '#default_value' => $config->get('platform.connection_timeout') ?: 30,
      '#min' => 5,
      '#max' => 120,
      '#field_suffix' => $this->t('seconds'),
    ];

    $form['platform']['max_retries'] = [
      '#type' => 'number',
      '#title' => $this->t('Maximum retries'),
      '#description' => $this->t('Number of retry attempts on transient failures before giving up.'),
      '#default_value' => $config->get('platform.max_retries') ?: 3,
      '#min' => 0,
      '#max' => 10,
    ];

    $form['platform']['retry_delay'] = [
      '#type' => 'number',
      '#title' => $this->t('Retry delay'),
      '#description' => $this->t('Delay between retry attempts. Exponential backoff is applied automatically.'),
      '#default_value' => $config->get('platform.retry_delay') ?: 1000,
      '#min' => 100,
      '#max' => 30000,
      '#field_suffix' => $this->t('ms'),
    ];

    // Show current resolution status.
    $resolved = $this->endpointResolver->getAllResolved();
    $statusRows = [];
    foreach (['a2a_collector_url', 'a2a_stream_url', 'mesh_url', 'mcp_url'] as $key) {
      if (isset($resolved[$key])) {
        $statusRows[] = [
          $key,
          $resolved[$key]['url'],
          $resolved[$key]['source'],
          $resolved[$key]['env_var'],
        ];
      }
    }

    $form['platform']['resolution_status'] = [
      '#type' => 'details',
      '#title' => $this->t('Current resolution status'),
      '#description' => $this->t('Shows how each endpoint URL is currently being resolved.'),
      '#open' => FALSE,
    ];

    $form['platform']['resolution_status']['table'] = [
      '#type' => 'table',
      '#header' => [
        $this->t('Endpoint'),
        $this->t('Resolved URL'),
        $this->t('Source'),
        $this->t('Env variable'),
      ],
      '#rows' => $statusRows,
      '#empty' => $this->t('No endpoints configured.'),
    ];

    return parent::buildForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $exposedAgents = array_values(array_filter($form_state->getValue('exposed_agents')));

    $this->config('ai_agents_communication.settings')
      ->set('agent_name', $form_state->getValue('agent_name'))
      ->set('agent_description', $form_state->getValue('agent_description'))
      ->set('agent_version', $form_state->getValue('agent_version'))
      ->set('provider_organization', $form_state->getValue('provider_organization'))
      ->set('provider_url', $form_state->getValue('provider_url'))
      ->set('auth_key_id', $form_state->getValue('auth_key_id'))
      ->set('exposed_agents', $exposedAgents)
      ->set('platform.a2a_collector_url', $form_state->getValue('a2a_collector_url'))
      ->set('platform.a2a_stream_url', $form_state->getValue('a2a_stream_url'))
      ->set('platform.mesh_url', $form_state->getValue('mesh_url'))
      ->set('platform.mcp_url', $form_state->getValue('mcp_url'))
      ->set('platform.connection_timeout', (int) $form_state->getValue('connection_timeout'))
      ->set('platform.max_retries', (int) $form_state->getValue('max_retries'))
      ->set('platform.retry_delay', (int) $form_state->getValue('retry_delay'))
      ->save();

    parent::submitForm($form, $form_state);
  }

}
