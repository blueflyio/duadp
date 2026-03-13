<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Config\ImmutableConfig;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Extension\ModuleHandlerInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\Core\Logger\LoggerChannelInterface;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\RequestOptions;

/**
 * Service for automated capability discovery.
 *
 * Provides local site manifest generation and remote agent discovery via
 * the agent-mesh service. The local manifest describes this Drupal site's
 * capabilities (modules, entities, system info). Remote discovery queries
 * the mesh to find all registered agents in the fleet.
 */
class DiscoveryService {

  /**
   * The logger service.
   *
   * @var \Drupal\Core\Logger\LoggerChannelInterface
   */
  protected LoggerChannelInterface $logger;

  /**
   * Default mesh URL fallback.
   */
  protected const DEFAULT_MESH_URL = 'https://mesh.blueflyagents.com';

  /**
   * Constructs a DiscoveryService object.
   *
   * @param \Drupal\Core\Extension\ModuleHandlerInterface $moduleHandler
   *   The module handler service.
   * @param \Drupal\Core\Entity\EntityTypeManagerInterface $entityTypeManager
   *   The entity type manager service.
   * @param \GuzzleHttp\ClientInterface $httpClient
   *   The HTTP client service.
   * @param \Drupal\Core\Config\ConfigFactoryInterface $configFactory
   *   The config factory service.
   * @param \Drupal\Core\Logger\LoggerChannelFactoryInterface $loggerFactory
   *   The logger channel factory.
   */
  public function __construct(
    protected ModuleHandlerInterface $moduleHandler,
    protected EntityTypeManagerInterface $entityTypeManager,
    protected ClientInterface $httpClient,
    protected ConfigFactoryInterface $configFactory,
    protected LoggerChannelFactoryInterface $loggerFactory,
  ) {
    $this->logger = $loggerFactory->get('ai_agents_client');
  }

  /**
   * Get a manifest of this site's capabilities.
   *
   * Builds a comprehensive manifest describing the local Drupal site for
   * registration with the mesh and fleet management. Includes installed
   * modules, entity counts, system information, and available tools.
   *
   * @return array
   *   Array containing:
   *   - modules: string[] List of installed module names.
   *   - entities: array<string, int> Entity type counts.
   *   - system: array System information (PHP, Drupal version, memory).
   *   - tools: array Available tool definitions (when Tool module present).
   */
  public function getManifest(): array {
    $manifest = [
      'modules' => array_keys($this->moduleHandler->getModuleList()),
      'entities' => $this->discoverEntityCounts(),
      'system' => [
        'php_version' => PHP_VERSION,
        'drupal_version' => \Drupal::VERSION,
        'memory_limit' => ini_get('memory_limit'),
      ],
    ];

    // Include available tools when the Tool module is installed.
    if ($this->moduleHandler->moduleExists('tool')) {
      $manifest['tools'] = $this->discoverTools();
    }

    // Include available AI agents when ai_agents module is installed.
    if ($this->moduleHandler->moduleExists('ai_agents')) {
      $manifest['agents'] = $this->discoverLocalAgents();
    }

    // Allow other modules to alter the manifest.
    $this->moduleHandler->alter('ai_agents_client_manifest', $manifest);

    return $manifest;
  }

  /**
   * Discover agents from the remote mesh service.
   *
   * Calls GET /api/v1/discovery on the configured mesh URL. Returns the
   * raw response from the mesh which may include agents from all fleet
   * sites. Falls back to an empty result on network errors rather than
   * throwing, since discovery is often called from non-critical paths.
   *
   * @return array
   *   Array of agents from the mesh, or empty array on failure.
   */
  public function discoverRemoteAgents(): array {
    $meshUrl = $this->getMeshUrl();
    $url = rtrim($meshUrl, '/') . '/api/v1/discovery';
    $config = $this->getConfig();

    try {
      $response = $this->httpClient->request('GET', $url, [
        RequestOptions::TIMEOUT => (int) ($config->get('timeout') ?: 30),
        RequestOptions::CONNECT_TIMEOUT => (int) ($config->get('connect_timeout') ?: 10),
        RequestOptions::HEADERS => [
          'Accept' => 'application/json',
          'User-Agent' => 'Drupal-AI-Agents-Client/1.0',
          'X-Client-ID' => $config->get('client_id') ?: 'unknown',
        ],
      ]);

      $statusCode = $response->getStatusCode();
      if ($statusCode < 200 || $statusCode >= 300) {
        $this->logger->warning('Mesh discovery returned HTTP @code from @url.', [
          '@code' => $statusCode,
          '@url' => $url,
        ]);
        return [];
      }

      $body = (string) $response->getBody();
      if (empty($body)) {
        return [];
      }

      $decoded = json_decode($body, TRUE, 512, JSON_THROW_ON_ERROR);
      $agents = $decoded['agents'] ?? $decoded['data'] ?? $decoded;

      $this->logger->info('Remote discovery found @count agents from @url.', [
        '@count' => is_array($agents) ? count($agents) : 0,
        '@url' => $url,
      ]);

      return is_array($agents) ? $agents : [];
    }
    catch (GuzzleException $e) {
      $this->logger->warning('Remote agent discovery failed: @msg', [
        '@msg' => $e->getMessage(),
      ]);
      return [];
    }
    catch (\JsonException $e) {
      $this->logger->warning('Mesh discovery returned invalid JSON: @msg', [
        '@msg' => $e->getMessage(),
      ]);
      return [];
    }
  }

  /**
   * Register this site with the mesh.
   *
   * Posts the local manifest to the mesh so this site becomes visible
   * in fleet management and agent discovery.
   *
   * @return bool
   *   TRUE if registration succeeded, FALSE otherwise.
   */
  public function registerWithMesh(): bool {
    $meshUrl = $this->getMeshUrl();
    $url = rtrim($meshUrl, '/') . '/api/v1/discovery/register';
    $config = $this->getConfig();

    $payload = [
      'client_id' => $config->get('client_id') ?: 'unknown',
      'gateway_url' => $config->get('gateway_url') ?: '',
      'timestamp' => time(),
      'manifest' => $this->getManifest(),
    ];

    try {
      $response = $this->httpClient->request('POST', $url, [
        RequestOptions::JSON => $payload,
        RequestOptions::TIMEOUT => (int) ($config->get('timeout') ?: 30),
        RequestOptions::CONNECT_TIMEOUT => (int) ($config->get('connect_timeout') ?: 10),
        RequestOptions::HEADERS => [
          'Accept' => 'application/json',
          'User-Agent' => 'Drupal-AI-Agents-Client/1.0',
          'X-Client-ID' => $config->get('client_id') ?: 'unknown',
        ],
      ]);

      $statusCode = $response->getStatusCode();
      if ($statusCode >= 200 && $statusCode < 300) {
        $this->logger->info('Site registered with mesh at @url.', [
          '@url' => $url,
        ]);
        return TRUE;
      }

      $this->logger->warning('Mesh registration returned HTTP @code.', [
        '@code' => $statusCode,
      ]);
      return FALSE;
    }
    catch (GuzzleException $e) {
      $this->logger->error('Mesh registration failed: @msg', [
        '@msg' => $e->getMessage(),
      ]);
      return FALSE;
    }
  }

  /**
   * Discover entity counts for common entity types.
   *
   * @return array<string, int>
   *   Array of entity type counts.
   */
  protected function discoverEntityCounts(): array {
    $counts = [];
    $entityTypes = ['node', 'user', 'taxonomy_term', 'media', 'block_content'];

    foreach ($entityTypes as $type) {
      try {
        $counts[$type] = (int) $this->entityTypeManager
          ->getStorage($type)
          ->getQuery()
          ->accessCheck(FALSE)
          ->count()
          ->execute();
      }
      catch (\Exception $e) {
        // Entity type may not exist or be accessible.
      }
    }

    return $counts;
  }

  /**
   * Discover available tools from the Tool module.
   *
   * @return array
   *   Array of tool definitions with name and description.
   */
  protected function discoverTools(): array {
    $tools = [];

    try {
      $toolStorage = $this->entityTypeManager->getStorage('tool');
      $toolIds = $toolStorage->getQuery()
        ->accessCheck(FALSE)
        ->execute();

      foreach ($toolStorage->loadMultiple($toolIds) as $tool) {
        $tools[] = [
          'id' => $tool->id(),
          'label' => $tool->label(),
        ];
      }
    }
    catch (\Exception $e) {
      // Tool storage may not exist.
      $this->logger->debug('Tool discovery skipped: @msg', [
        '@msg' => $e->getMessage(),
      ]);
    }

    return $tools;
  }

  /**
   * Discover locally registered AI agents.
   *
   * @return array
   *   Array of agent definitions with id and label.
   */
  protected function discoverLocalAgents(): array {
    $agents = [];

    try {
      $agentStorage = $this->entityTypeManager->getStorage('ai_agent');
      $agentIds = $agentStorage->getQuery()
        ->accessCheck(FALSE)
        ->execute();

      foreach ($agentStorage->loadMultiple($agentIds) as $agent) {
        $agents[] = [
          'id' => $agent->id(),
          'label' => $agent->label(),
        ];
      }
    }
    catch (\Exception $e) {
      // Agent storage may not exist.
      $this->logger->debug('Agent discovery skipped: @msg', [
        '@msg' => $e->getMessage(),
      ]);
    }

    return $agents;
  }

  /**
   * Get the configured mesh URL with environment variable fallback.
   *
   * @return string
   *   The mesh URL.
   */
  protected function getMeshUrl(): string {
    $config = $this->getConfig();
    $meshUrl = $config->get('mesh_url');

    if (!empty($meshUrl)) {
      return $meshUrl;
    }

    $envUrl = getenv('AGENT_MESH_URL');
    if (!empty($envUrl)) {
      return $envUrl;
    }

    return self::DEFAULT_MESH_URL;
  }

  /**
   * Get the module configuration.
   *
   * @return \Drupal\Core\Config\ImmutableConfig
   *   The immutable config object.
   */
  protected function getConfig(): ImmutableConfig {
    return $this->configFactory->get('ai_agents_client.settings');
  }

}
