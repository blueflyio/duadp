<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\AiAgent;

use Drupal\Core\Access\AccessResult;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\DependencyInjection\DependencySerializationTrait;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Extension\ExtensionPathResolver;
use Drupal\Core\File\FileSystemInterface;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Session\AccountProxyInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\ai\AiProviderPluginManager;
use Drupal\ai\Service\PromptJsonDecoder\PromptJsonDecoderInterface;
use Drupal\ai_agents\Attribute\AiAgent;
use Drupal\ai_agents\PluginBase\AiAgentBase;
use Drupal\ai_agents\PluginInterfaces\AiAgentInterface;
use Drupal\ai_agents\Service\AgentHelper;
use Drupal\bluefly_agent_platform\Service\ClientAiService;
use Drupal\bluefly_agent_platform\Service\ClientService;
use Drupal\bluefly_agent_platform\Service\DiscoveryService;
use GuzzleHttp\ClientInterface as HttpClientInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * AI Agent plugin providing distributed agent gateway capabilities.
 *
 * Exposes gateway operations to the ai_agents orchestration system:
 * - Route tasks to remote agents via the configured gateway.
 * - Check gateway health and connectivity status.
 * - List available remote agents registered in the mesh.
 */
#[AiAgent(
  id: 'gateway_agent',
  label: new TranslatableMarkup('Gateway Agent'),
)]
class GatewayAgent extends AiAgentBase {

  use DependencySerializationTrait;

  /**
   * The resolved task type after solvability analysis.
   *
   * @var string
   */
  protected string $taskType = '';

  /**
   * Constructs a GatewayAgent instance.
   */
  public function __construct(
    array $configuration,
    $plugin_id,
    $plugin_definition,
    AgentHelper $agentHelper,
    FileSystemInterface $fileSystem,
    ConfigFactoryInterface $config,
    AccountProxyInterface $currentUser,
    ExtensionPathResolver $extensionPathResolver,
    PromptJsonDecoderInterface $promptJsonDecoder,
    AiProviderPluginManager $aiProviderPluginManager,
    EntityTypeManagerInterface $entityTypeManager,
    protected ClientService $clientService,
    protected DiscoveryService $discoveryService,
    protected ClientAiService $clientAiService,
    protected HttpClientInterface $httpClient,
  ) {
    parent::__construct(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $agentHelper,
      $fileSystem,
      $config,
      $currentUser,
      $extensionPathResolver,
      $promptJsonDecoder,
      $aiProviderPluginManager,
      $entityTypeManager,
    );
  }

  /**
   * {@inheritDoc}
   */
  public static function create(
    ContainerInterface $container,
    array $configuration,
    $plugin_id,
    $plugin_definition,
  ) {
    return new static(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->get('ai_agents.agent_helper'),
      $container->get('file_system'),
      $container->get('config.factory'),
      $container->get('current_user'),
      $container->get('extension.path.resolver'),
      $container->get('ai.prompt_json_decode'),
      $container->get('ai.provider'),
      $container->get('entity_type.manager'),
      $container->get('ai_agents_client.gateway'),
      $container->get('ai_agents_client.discovery'),
      $container->get('ai_agents_client.ai_service'),
      $container->get('http_client'),
    );
  }

  /**
   * {@inheritDoc}
   */
  public function agentsNames(): array {
    return [
      'Gateway Agent',
    ];
  }

  /**
   * {@inheritDoc}
   */
  public function agentsCapabilities(): array {
    return [
      'gateway_agent' => [
        'name' => 'Gateway Agent',
        'description' => 'This agent manages distributed agent gateway operations. It can route tasks to remote agents registered in the gateway mesh, check gateway health and connectivity, and list available remote agents with their capabilities. Use this agent when you need to delegate work to external agents or inspect the distributed agent network.',
        'usage_instructions' => "Use this agent when you need to:\n- Route a task to a specific remote agent or let the gateway auto-select the best agent.\n- Check whether the gateway is healthy and reachable.\n- List all remote agents currently registered in the mesh with their capabilities.\n- Inspect what remote agents are available before deciding on a delegation strategy.",
        'inputs' => [
          'free_text' => [
            'name' => 'Prompt',
            'type' => 'string',
            'description' => 'The task description, health check request, or query about remote agents.',
            'default_value' => '',
          ],
        ],
        'outputs' => [
          'result' => [
            'description' => 'The result of the gateway operation: routed task response, health status, or list of remote agents.',
            'type' => 'string',
          ],
        ],
      ],
    ];
  }

  /**
   * {@inheritDoc}
   */
  public function isAvailable(): bool {
    $gatewayUrl = $this->config->get('ai_agents_client.settings')->get('gateway_url');
    return !empty($gatewayUrl);
  }

  /**
   * {@inheritDoc}
   */
  public function hasAccess() {
    if (!$this->currentUser->hasPermission('administer ai agents client')) {
      return AccessResult::forbidden();
    }
    return parent::hasAccess();
  }

  /**
   * {@inheritDoc}
   */
  public function determineSolvability(): int {
    parent::determineSolvability();
    $this->taskType = $this->classifyTask();

    switch ($this->taskType) {
      case 'route_task':
        return AiAgentInterface::JOB_SOLVABLE;

      case 'health_check':
        return AiAgentInterface::JOB_SOLVABLE;

      case 'list_agents':
        return AiAgentInterface::JOB_SOLVABLE;

      case 'information':
        return AiAgentInterface::JOB_SHOULD_ANSWER_QUESTION;

      case 'fail':
        $this->setInformation('The gateway agent could not understand the requested task. Please rephrase your request as: route a task, check gateway health, or list remote agents.');
        return AiAgentInterface::JOB_INFORMS;
    }

    return AiAgentInterface::JOB_NOT_SOLVABLE;
  }

  /**
   * {@inheritDoc}
   */
  public function solve(): string {
    parent::solve();
    $messages = [];

    foreach ($this->data as $data) {
      $action = $data['action'] ?? $this->taskType;

      switch ($action) {
        case 'route_task':
          $messages[] = $this->routeTask($data);
          break;

        case 'health_check':
          $messages[] = $this->checkHealth();
          break;

        case 'list_agents':
          $messages[] = $this->listRemoteAgents();
          break;
      }
    }

    return implode("\n\n", array_filter($messages));
  }

  /**
   * {@inheritDoc}
   */
  public function answerQuestion() {
    $context = $this->getFullContextOfTask($this->task);

    $systemPrompt = "You are a distributed agent gateway assistant. You know about the gateway's health, remote agents, and task routing. Answer questions based on the current gateway state.\n\n"
      . "Current gateway manifest:\n" . json_encode($this->discoveryService->getManifest(), JSON_PRETTY_PRINT);

    return $this->clientAiService->chat($systemPrompt, $context);
  }

  /**
   * {@inheritDoc}
   */
  public function defaultConfiguration(): array {
    return [
      'timeout' => 30,
      'retry_count' => 3,
    ];
  }

  /**
   * {@inheritDoc}
   */
  public function buildConfigurationForm(array $form, FormStateInterface $form_state): array {
    $form['timeout'] = [
      '#type' => 'number',
      '#title' => $this->t('Gateway timeout'),
      '#description' => $this->t('Timeout in seconds for gateway HTTP requests.'),
      '#default_value' => $this->configuration['timeout'] ?? 30,
      '#min' => 5,
      '#max' => 120,
    ];

    $form['retry_count'] = [
      '#type' => 'number',
      '#title' => $this->t('Retry count'),
      '#description' => $this->t('Number of retries on transient gateway failures.'),
      '#default_value' => $this->configuration['retry_count'] ?? 3,
      '#min' => 0,
      '#max' => 10,
    ];

    return $form;
  }

  /**
   * {@inheritDoc}
   */
  public function validateConfigurationForm(array &$form, FormStateInterface $form_state): void {
    $timeout = $form_state->getValue('timeout');
    if (!is_numeric($timeout) || $timeout < 5) {
      $form_state->setErrorByName('timeout', $this->t('Timeout must be at least 5 seconds.'));
    }
  }

  /**
   * {@inheritDoc}
   */
  public function submitConfigurationForm(array &$form, FormStateInterface $form_state): void {
    $this->configuration['timeout'] = (int) $form_state->getValue('timeout');
    $this->configuration['retry_count'] = (int) $form_state->getValue('retry_count');
  }

  /**
   * Classify the task into a gateway operation type using the AI provider.
   *
   * @return string
   *   One of: route_task, health_check, list_agents, information, fail.
   */
  protected function classifyTask(): string {
    $context = $this->getFullContextOfTask($this->task);

    $systemPrompt = "You are a classifier for a distributed agent gateway. Given a user's task, classify it into exactly one of these categories. Respond with only the category key, no other text.\n\nCategories:\n- route_task: The user wants to send, delegate, or route a task to a remote agent.\n- health_check: The user wants to check gateway health, status, or connectivity.\n- list_agents: The user wants to list, discover, or inspect available remote agents.\n- information: The user is asking a general question about the gateway or agents.\n- fail: The request is unrelated to gateway operations.";

    $response = $this->clientAiService->chat($systemPrompt, $context);
    $classified = strtolower(trim($response));

    $valid = ['route_task', 'health_check', 'list_agents', 'information', 'fail'];
    if (in_array($classified, $valid, TRUE)) {
      return $classified;
    }

    // Fallback: try to match partial response.
    foreach ($valid as $category) {
      if (str_contains($classified, $category)) {
        return $category;
      }
    }

    return 'fail';
  }

  /**
   * Route a task to a remote agent via the gateway.
   *
   * @param array $data
   *   Task data including optional 'target_agent' key.
   *
   * @return string
   *   Result message from the routing operation.
   */
  protected function routeTask(array $data): string {
    $config = $this->config->get('ai_agents_client.settings');
    $gatewayUrl = $config->get('gateway_url');

    if (empty($gatewayUrl)) {
      return 'Gateway URL is not configured. Set it at /admin/config/ai-agents-client/settings.';
    }

    $context = $this->getFullContextOfTask($this->task);

    $payload = [
      'client_id' => $config->get('client_id') ?? 'drupal-default',
      'task' => [
        'description' => $context,
        'target_agent' => $data['target_agent'] ?? NULL,
        'timestamp' => time(),
      ],
      'capabilities' => $this->discoveryService->getManifest(),
    ];

    try {
      $response = $this->httpClient->request('POST', rtrim($gatewayUrl, '/') . '/api/v1/tasks/route', [
        'json' => $payload,
        'timeout' => $this->configuration['timeout'] ?? 30,
        'headers' => [
          'Content-Type' => 'application/json',
          'Accept' => 'application/json',
        ],
      ]);

      $body = json_decode((string) $response->getBody(), TRUE);
      $agentName = $body['assigned_agent'] ?? 'unknown';
      $taskId = $body['task_id'] ?? 'N/A';
      $status = $body['status'] ?? 'accepted';

      $this->structuredResultData->addExtraData([
        'type' => 'route_task',
        'task_id' => $taskId,
        'assigned_agent' => $agentName,
        'status' => $status,
      ]);

      return sprintf(
        "Task routed successfully.\n- Task ID: %s\n- Assigned agent: %s\n- Status: %s",
        $taskId,
        $agentName,
        $status
      );
    }
    catch (\Exception $e) {
      return sprintf('Failed to route task to gateway: %s', $e->getMessage());
    }
  }

  /**
   * Check the gateway health status.
   *
   * @return string
   *   Human-readable health status report.
   */
  protected function checkHealth(): string {
    $config = $this->config->get('ai_agents_client.settings');
    $gatewayUrl = $config->get('gateway_url');

    if (empty($gatewayUrl)) {
      return 'Gateway URL is not configured. Set it at /admin/config/ai-agents-client/settings.';
    }

    try {
      $response = $this->httpClient->request('GET', rtrim($gatewayUrl, '/') . '/api/v1/health', [
        'timeout' => $this->configuration['timeout'] ?? 30,
        'headers' => [
          'Accept' => 'application/json',
        ],
      ]);

      $statusCode = $response->getStatusCode();
      $body = json_decode((string) $response->getBody(), TRUE);
      $status = $body['status'] ?? 'unknown';
      $uptime = $body['uptime'] ?? 'N/A';
      $agentCount = $body['connected_agents'] ?? 'N/A';

      $this->structuredResultData->addExtraData([
        'type' => 'health_check',
        'http_status' => $statusCode,
        'gateway_status' => $status,
      ]);

      return sprintf(
        "Gateway health check:\n- URL: %s\n- HTTP status: %d\n- Gateway status: %s\n- Uptime: %s\n- Connected agents: %s",
        $gatewayUrl,
        $statusCode,
        $status,
        $uptime,
        $agentCount
      );
    }
    catch (\Exception $e) {
      return sprintf("Gateway is unreachable at %s.\nError: %s", $gatewayUrl, $e->getMessage());
    }
  }

  /**
   * List remote agents available through the gateway.
   *
   * @return string
   *   Formatted list of remote agents.
   */
  protected function listRemoteAgents(): string {
    $config = $this->config->get('ai_agents_client.settings');
    $gatewayUrl = $config->get('gateway_url');

    if (empty($gatewayUrl)) {
      return 'Gateway URL is not configured. Set it at /admin/config/ai-agents-client/settings.';
    }

    try {
      $response = $this->httpClient->request('GET', rtrim($gatewayUrl, '/') . '/api/v1/agents', [
        'timeout' => $this->configuration['timeout'] ?? 30,
        'headers' => [
          'Accept' => 'application/json',
        ],
      ]);

      $body = json_decode((string) $response->getBody(), TRUE);
      $agents = $body['agents'] ?? [];

      if (empty($agents)) {
        return 'No remote agents are currently registered in the gateway.';
      }

      $this->structuredResultData->addExtraData([
        'type' => 'list_agents',
        'agent_count' => count($agents),
      ]);

      $lines = [sprintf('Remote agents registered in gateway (%d):', count($agents)), ''];
      foreach ($agents as $agent) {
        $name = $agent['name'] ?? $agent['id'] ?? 'unknown';
        $status = $agent['status'] ?? 'unknown';
        $capabilities = $agent['capabilities'] ?? [];
        $capStr = !empty($capabilities) ? implode(', ', $capabilities) : 'none listed';

        $lines[] = sprintf('- %s [%s] -- capabilities: %s', $name, $status, $capStr);
      }

      return implode("\n", $lines);
    }
    catch (\Exception $e) {
      return sprintf('Failed to list remote agents: %s', $e->getMessage());
    }
  }

}
