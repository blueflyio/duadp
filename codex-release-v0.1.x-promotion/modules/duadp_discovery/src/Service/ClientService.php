<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

use Drupal\bluefly_agent_platform\Exception\FleetCommunicationException;
use Drupal\bluefly_agent_platform\Exception\LLMPlatformCommunicationException;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Config\ImmutableConfig;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\Core\Logger\LoggerChannelInterface;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Exception\RequestException;
use GuzzleHttp\RequestOptions;

/**
 * Service for AI Agents Client fleet management and mesh communication.
 *
 * Handles HTTP communication with the agent-mesh service for discovery,
 * fleet status, and synchronization. Also communicates with individual
 * fleet sites via their MCP endpoints for agent execution.
 */
class ClientService {

  /**
   * The logger service.
   *
   * @var \Drupal\Core\Logger\LoggerChannelInterface
   */
  protected LoggerChannelInterface $logger;

  /**
   * Default mesh URL when no config or env var is set.
   */
  protected const DEFAULT_MESH_URL = 'https://mesh.blueflyagents.com';

  /**
   * Default MCP URL when no config or env var is set.
   */
  protected const DEFAULT_MCP_URL = 'https://mcp.blueflyagents.com';

  /**
   * HTTP status codes that are safe to retry on.
   *
   * @var int[]
   */
  protected const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

  /**
   * Constructs a ClientService object.
   *
   * @param \Drupal\Core\Entity\EntityTypeManagerInterface $entityTypeManager
   *   The entity type manager service.
   * @param \Drupal\Core\Logger\LoggerChannelFactoryInterface $loggerFactory
   *   The logger channel factory.
   * @param \Drupal\Core\Config\ConfigFactoryInterface $configFactory
   *   The config factory service.
   * @param \GuzzleHttp\ClientInterface $httpClient
   *   The HTTP client service.
   * @param \Drupal\bluefly_agent_platform\Service\DiscoveryService $discovery
   *   The discovery service.
   */
  public function __construct(
    protected EntityTypeManagerInterface $entityTypeManager,
    protected LoggerChannelFactoryInterface $loggerFactory,
    protected ConfigFactoryInterface $configFactory,
    protected ClientInterface $httpClient,
    protected DiscoveryService $discovery,
  ) {
    $this->logger = $loggerFactory->get('ai_agents_client');
  }

  /**
   * Discover agents from the mesh registry.
   *
   * Calls GET /api/v1/discovery on the agent-mesh service to retrieve
   * all registered agents and their capabilities.
   *
   * @return array
   *   Array of discovered agents with their metadata, capabilities, and
   *   status. Returns an empty array on failure.
   *
   * @throws \Drupal\bluefly_agent_platform\Exception\LLMPlatformCommunicationException
   *   When the mesh is unreachable after all retry attempts.
   */
  public function discoverAgents(): array {
    $meshUrl = $this->getMeshUrl();
    $url = rtrim($meshUrl, '/') . '/api/v1/discovery';

    $this->logger->info('Discovering agents from mesh at @url.', ['@url' => $url]);

    $response = $this->requestWithRetry('GET', $url);
    $body = $this->decodeResponse($response);

    $agents = $body['agents'] ?? $body['data'] ?? $body;
    if (!is_array($agents)) {
      $agents = [];
    }

    $this->logger->info('Discovered @count agents from mesh.', [
      '@count' => count($agents),
    ]);

    return $agents;
  }

  /**
   * Execute an agent on a fleet site via its MCP endpoint.
   *
   * Sends a tool call to the fleet site's MCP endpoint. The payload follows
   * the MCP protocol tool invocation format with the specified agent and
   * input parameters.
   *
   * @param string $siteUrl
   *   The base URL of the fleet site (e.g. https://site.example.com).
   * @param string $agentId
   *   The agent identifier to execute.
   * @param string $toolName
   *   The MCP tool name to invoke on the agent.
   * @param array $input
   *   Input parameters for the tool call.
   * @param array $options
   *   Optional overrides:
   *   - timeout: (int) Request timeout in seconds.
   *   - headers: (array) Additional HTTP headers.
   *   - mcp_path: (string) Custom MCP endpoint path (default /api/mcp).
   *
   * @return array
   *   The tool execution result from the fleet site.
   *
   * @throws \Drupal\bluefly_agent_platform\Exception\FleetCommunicationException
   *   When the fleet site is unreachable or returns an error.
   */
  public function executeAgent(
    string $siteUrl,
    string $agentId,
    string $toolName,
    array $input = [],
    array $options = [],
  ): array {
    $mcpPath = $options['mcp_path'] ?? '/api/mcp';
    $url = rtrim($siteUrl, '/') . $mcpPath;

    $payload = [
      'jsonrpc' => '2.0',
      'id' => $this->generateRequestId(),
      'method' => 'tools/call',
      'params' => [
        'name' => $toolName,
        'arguments' => array_merge($input, [
          '_agent_id' => $agentId,
        ]),
      ],
    ];

    $this->logger->info('Executing agent @agent tool @tool on @site.', [
      '@agent' => $agentId,
      '@tool' => $toolName,
      '@site' => $siteUrl,
    ]);

    $config = $this->getConfig();
    $timeout = $options['timeout'] ?? (int) ($config->get('timeout') ?: 30);
    $headers = array_merge([
      'Content-Type' => 'application/json',
      'Accept' => 'application/json',
      'X-Client-ID' => $config->get('client_id') ?: 'unknown',
    ], $options['headers'] ?? []);

    try {
      $response = $this->requestWithRetry('POST', $url, [
        RequestOptions::JSON => $payload,
        RequestOptions::TIMEOUT => $timeout,
        RequestOptions::HEADERS => $headers,
      ]);

      $body = $this->decodeResponse($response);

      // Check for JSON-RPC error response.
      if (isset($body['error'])) {
        $errorMsg = $body['error']['message'] ?? 'Unknown MCP error';
        $errorCode = $body['error']['code'] ?? -1;
        $this->logger->error('MCP error from @site: @code @msg', [
          '@site' => $siteUrl,
          '@code' => $errorCode,
          '@msg' => $errorMsg,
        ]);
        throw new FleetCommunicationException(
          sprintf('MCP error from %s: [%d] %s', $siteUrl, $errorCode, $errorMsg)
        );
      }

      $this->logger->info('Agent @agent executed successfully on @site.', [
        '@agent' => $agentId,
        '@site' => $siteUrl,
      ]);

      return $body['result'] ?? $body;
    }
    catch (FleetCommunicationException $e) {
      throw $e;
    }
    catch (\Exception $e) {
      $this->logger->error('Failed to execute agent @agent on @site: @msg', [
        '@agent' => $agentId,
        '@site' => $siteUrl,
        '@msg' => $e->getMessage(),
      ]);
      throw new FleetCommunicationException(
        sprintf('Failed to execute agent %s on %s: %s', $agentId, $siteUrl, $e->getMessage()),
        0,
        $e,
      );
    }
  }

  /**
   * Get fleet status from the mesh service.
   *
   * Retrieves the current status of all registered fleet sites including
   * health, agent counts, last heartbeat, and capability summaries.
   *
   * @return array
   *   Array of fleet site statuses. Each entry contains:
   *   - site_id: string
   *   - url: string
   *   - status: string (healthy|degraded|offline)
   *   - last_heartbeat: int (timestamp)
   *   - agent_count: int
   *   - capabilities: array
   *
   * @throws \Drupal\bluefly_agent_platform\Exception\LLMPlatformCommunicationException
   *   When the mesh is unreachable after all retry attempts.
   */
  public function getFleetStatus(): array {
    $meshUrl = $this->getMeshUrl();
    $url = rtrim($meshUrl, '/') . '/api/v1/fleet/status';

    $this->logger->info('Fetching fleet status from @url.', ['@url' => $url]);

    $response = $this->requestWithRetry('GET', $url);
    $body = $this->decodeResponse($response);

    $sites = $body['sites'] ?? $body['data'] ?? $body;
    if (!is_array($sites)) {
      $sites = [];
    }

    $this->logger->info('Fleet status retrieved: @count sites.', [
      '@count' => count($sites),
    ]);

    return $sites;
  }

  /**
   * Synchronize fleet state with the mesh service.
   *
   * Sends a sync request to the mesh that triggers re-discovery of all
   * fleet sites, refreshes agent registrations, and updates health status.
   * Also includes this site's own manifest in the sync payload.
   *
   * @param bool $force
   *   When TRUE, forces a full resync even if the mesh believes state is
   *   current. Defaults to FALSE.
   *
   * @return array
   *   Sync result from the mesh containing:
   *   - synced_sites: int (number of sites synchronized)
   *   - errors: array (any per-site errors encountered)
   *   - timestamp: int (when the sync completed)
   *
   * @throws \Drupal\bluefly_agent_platform\Exception\LLMPlatformCommunicationException
   *   When the mesh is unreachable after all retry attempts.
   */
  public function syncFleet(bool $force = FALSE): array {
    $meshUrl = $this->getMeshUrl();
    $url = rtrim($meshUrl, '/') . '/api/v1/fleet/sync';
    $config = $this->getConfig();

    $payload = [
      'client_id' => $config->get('client_id') ?: 'unknown',
      'force' => $force,
      'timestamp' => time(),
      'manifest' => $this->discovery->getManifest(),
    ];

    $this->logger->info('Syncing fleet via @url (force=@force).', [
      '@url' => $url,
      '@force' => $force ? 'yes' : 'no',
    ]);

    $response = $this->requestWithRetry('POST', $url, [
      RequestOptions::JSON => $payload,
    ]);

    $body = $this->decodeResponse($response);

    $this->logger->info('Fleet sync completed: @count sites synced.', [
      '@count' => $body['synced_sites'] ?? 'unknown',
    ]);

    return $body;
  }

  /**
   * Send heartbeat to the gateway.
   */
  public function sendHeartbeat(): void {
    $config = $this->getConfig();
    $gatewayUrl = $config->get('gateway_url');

    if (empty($gatewayUrl)) {
      return;
    }

    $url = rtrim($gatewayUrl, '/') . '/api/v1/clients/heartbeat';

    try {
      $payload = [
        'client_id' => $config->get('client_id') ?: 'unknown',
        'timestamp' => time(),
        'capabilities' => $this->discovery->getManifest(),
      ];

      $this->requestWithRetry('POST', $url, [
        RequestOptions::JSON => $payload,
      ]);

      $this->logger->info('Heartbeat sent to @url with capabilities manifest.', [
        '@url' => $url,
      ]);
    }
    catch (\Exception $e) {
      $this->logger->error('Heartbeat failed: @message', [
        '@message' => $e->getMessage(),
      ]);
    }
  }

  /**
   * Report current client status to the main platform.
   *
   * POSTs a status payload (client ID, agent count, health summary, Drupal
   * version, and capabilities manifest) to the configured gateway URL at
   * the /api/v1/clients/report endpoint. Gracefully handles cases where the
   * gateway URL is not configured or the platform is unreachable.
   *
   * @throws \Drupal\bluefly_agent_platform\Exception\LLMPlatformCommunicationException
   *   When the platform returns a non-2xx response after all retries.
   */
  public function reportToMainPlatform(): void {
    $config = $this->getConfig();
    $gatewayUrl = $config->get('gateway_url');

    if (empty($gatewayUrl)) {
      $this->logger->notice('Platform report skipped: no gateway_url configured.');
      return;
    }

    $clientId = $config->get('client_id') ?: 'unknown';

    // Build the status payload.
    $manifest = $this->discovery->getManifest();

    // Count agents registered in the system.
    $agentCount = 0;
    try {
      $agentCount = (int) $this->entityTypeManager
        ->getStorage('ai_agent')
        ->getQuery()
        ->accessCheck(FALSE)
        ->count()
        ->execute();
    }
    catch (\Exception $e) {
      // ai_agent entity type may not exist; non-fatal.
      $this->logger->debug('Could not count ai_agent entities: @msg', [
        '@msg' => $e->getMessage(),
      ]);
    }

    $payload = [
      'client_id' => $clientId,
      'timestamp' => time(),
      'agent_count' => $agentCount,
      'health' => 'healthy',
      'version' => $manifest['system']['drupal_version'] ?? \Drupal::VERSION,
      'php_version' => $manifest['system']['php_version'] ?? PHP_VERSION,
      'modules' => $manifest['modules'] ?? [],
      'entities' => $manifest['entities'] ?? [],
    ];

    $reportUrl = rtrim($gatewayUrl, '/') . '/api/v1/clients/report';

    try {
      $this->requestWithRetry('POST', $reportUrl, [
        RequestOptions::JSON => $payload,
        RequestOptions::HEADERS => [
          'X-Client-ID' => $clientId,
        ],
      ]);

      $this->logger->info('Platform report sent successfully to @url.', [
        '@url' => $reportUrl,
      ]);
    }
    catch (LLMPlatformCommunicationException $e) {
      throw $e;
    }
    catch (\Exception $e) {
      throw new LLMPlatformCommunicationException(
        sprintf('Failed to report to platform at %s: %s', $reportUrl, $e->getMessage()),
        0,
        $e,
      );
    }
  }

  /**
   * Perform an HTTP request with exponential backoff retry.
   *
   * Retries on network errors, timeouts, and retryable HTTP status codes
   * (408, 429, 500, 502, 503, 504). Uses exponential backoff with jitter
   * to avoid thundering herd problems.
   *
   * @param string $method
   *   HTTP method (GET, POST, PUT, DELETE, PATCH).
   * @param string $url
   *   The full URL to request.
   * @param array $options
   *   Guzzle request options. Timeout and connect_timeout will be set from
   *   config if not provided.
   *
   * @return \Psr\Http\Message\ResponseInterface
   *   The successful HTTP response.
   *
   * @throws \Drupal\bluefly_agent_platform\Exception\LLMPlatformCommunicationException
   *   When all retry attempts are exhausted.
   */
  protected function requestWithRetry(string $method, string $url, array $options = []): \Psr\Http\Message\ResponseInterface {
    $config = $this->getConfig();

    $maxAttempts = max(1, (int) ($config->get('retry_attempts') ?: 3));
    $baseDelay = max(100, (int) ($config->get('retry_base_delay') ?: 1000));
    $maxDelay = max($baseDelay, (int) ($config->get('retry_max_delay') ?: 30000));
    $timeout = (int) ($config->get('timeout') ?: 30);
    $connectTimeout = (int) ($config->get('connect_timeout') ?: 10);
    $clientId = $config->get('client_id') ?: 'unknown';
    $apiToken = $config->get('api_token');

    // Set defaults if not provided in options.
    $options += [
      RequestOptions::TIMEOUT => $timeout,
      RequestOptions::CONNECT_TIMEOUT => $connectTimeout,
    ];

    // Merge default headers.
    $defaultHeaders = [
      'Accept' => 'application/json',
      'User-Agent' => 'Drupal-AI-Agents-Client/1.0',
      'X-Client-ID' => $clientId,
    ];
    if (!empty($apiToken)) {
      $defaultHeaders['Authorization'] = 'Bearer ' . $apiToken;
    }
    $options[RequestOptions::HEADERS] = array_merge(
      $defaultHeaders,
      $options[RequestOptions::HEADERS] ?? [],
    );

    $lastException = NULL;

    for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
      try {
        $response = $this->httpClient->request($method, $url, $options);
        $statusCode = $response->getStatusCode();

        if ($statusCode >= 200 && $statusCode < 300) {
          return $response;
        }

        // Non-retryable error status code.
        if (!in_array($statusCode, self::RETRYABLE_STATUS_CODES, TRUE)) {
          $body = (string) $response->getBody();
          throw new LLMPlatformCommunicationException(
            sprintf('%s %s returned HTTP %d: %s', $method, $url, $statusCode, mb_substr($body, 0, 500)),
          );
        }

        // Retryable status code - log and continue to backoff.
        $this->logger->warning(
          'Request @method @url returned retryable HTTP @code on attempt @attempt/@max.',
          [
            '@method' => $method,
            '@url' => $url,
            '@code' => $statusCode,
            '@attempt' => $attempt,
            '@max' => $maxAttempts,
          ],
        );
      }
      catch (ConnectException $e) {
        $lastException = $e;
        $this->logger->warning(
          'Connection failed for @method @url on attempt @attempt/@max: @msg',
          [
            '@method' => $method,
            '@url' => $url,
            '@attempt' => $attempt,
            '@max' => $maxAttempts,
            '@msg' => $e->getMessage(),
          ],
        );
      }
      catch (RequestException $e) {
        $lastException = $e;
        $statusCode = $e->hasResponse() ? $e->getResponse()->getStatusCode() : 0;

        // Only retry on retryable status codes or network errors.
        if ($statusCode > 0 && !in_array($statusCode, self::RETRYABLE_STATUS_CODES, TRUE)) {
          throw new LLMPlatformCommunicationException(
            sprintf('%s %s failed with HTTP %d: %s', $method, $url, $statusCode, $e->getMessage()),
            $statusCode,
            $e,
          );
        }

        $this->logger->warning(
          'Request @method @url failed on attempt @attempt/@max: @msg',
          [
            '@method' => $method,
            '@url' => $url,
            '@attempt' => $attempt,
            '@max' => $maxAttempts,
            '@msg' => $e->getMessage(),
          ],
        );
      }
      catch (GuzzleException $e) {
        $lastException = $e;
        $this->logger->warning(
          'Request @method @url failed on attempt @attempt/@max: @msg',
          [
            '@method' => $method,
            '@url' => $url,
            '@attempt' => $attempt,
            '@max' => $maxAttempts,
            '@msg' => $e->getMessage(),
          ],
        );
      }
      catch (LLMPlatformCommunicationException $e) {
        // Non-retryable; rethrow immediately.
        throw $e;
      }

      // Exponential backoff with jitter before next attempt.
      if ($attempt < $maxAttempts) {
        $delay = $this->calculateBackoffDelay($attempt, $baseDelay, $maxDelay);
        $this->logger->debug('Waiting @delay ms before retry attempt @next.', [
          '@delay' => $delay,
          '@next' => $attempt + 1,
        ]);
        usleep($delay * 1000);
      }
    }

    // All attempts exhausted.
    $errorMessage = $lastException
      ? $lastException->getMessage()
      : 'All request attempts returned retryable status codes.';

    $this->logger->error(
      'Request @method @url failed after @max attempts: @msg',
      [
        '@method' => $method,
        '@url' => $url,
        '@max' => $maxAttempts,
        '@msg' => $errorMessage,
      ],
    );

    throw new LLMPlatformCommunicationException(
      sprintf('%s %s failed after %d attempts: %s', $method, $url, $maxAttempts, $errorMessage),
      0,
      $lastException,
    );
  }

  /**
   * Calculate exponential backoff delay with jitter.
   *
   * Uses "full jitter" strategy: random value between 0 and min(cap, base *
   * 2^attempt). This avoids thundering herd when multiple clients retry
   * simultaneously.
   *
   * @param int $attempt
   *   The current attempt number (1-based).
   * @param int $baseDelay
   *   Base delay in milliseconds.
   * @param int $maxDelay
   *   Maximum delay cap in milliseconds.
   *
   * @return int
   *   The delay in milliseconds.
   */
  protected function calculateBackoffDelay(int $attempt, int $baseDelay, int $maxDelay): int {
    $exponential = $baseDelay * (2 ** ($attempt - 1));
    $capped = min($exponential, $maxDelay);
    // Full jitter: random between 0 and capped value.
    return random_int(0, (int) $capped);
  }

  /**
   * Decode a JSON response body.
   *
   * @param \Psr\Http\Message\ResponseInterface $response
   *   The HTTP response.
   *
   * @return array
   *   The decoded JSON as an associative array.
   *
   * @throws \Drupal\bluefly_agent_platform\Exception\LLMPlatformCommunicationException
   *   When the response body is not valid JSON.
   */
  protected function decodeResponse(\Psr\Http\Message\ResponseInterface $response): array {
    $body = (string) $response->getBody();

    if (empty($body)) {
      return [];
    }

    try {
      $decoded = json_decode($body, TRUE, 512, JSON_THROW_ON_ERROR);
    }
    catch (\JsonException $e) {
      throw new LLMPlatformCommunicationException(
        sprintf('Invalid JSON response: %s', $e->getMessage()),
        0,
        $e,
      );
    }

    return is_array($decoded) ? $decoded : [];
  }

  /**
   * Get the configured mesh URL with environment variable fallback.
   *
   * Resolution order:
   * 1. Config value from ai_agents_client.settings mesh_url
   * 2. AGENT_MESH_URL environment variable
   * 3. Default: https://mesh.blueflyagents.com
   *
   * @return string
   *   The mesh URL to use.
   */
  public function getMeshUrl(): string {
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
   * Get the configured MCP URL with environment variable fallback.
   *
   * Resolution order:
   * 1. Config value from ai_agents_client.settings mcp_url
   * 2. MCP_URL environment variable
   * 3. Default: https://mcp.blueflyagents.com
   *
   * @return string
   *   The MCP URL to use.
   */
  public function getMcpUrl(): string {
    $config = $this->getConfig();
    $mcpUrl = $config->get('mcp_url');

    if (!empty($mcpUrl)) {
      return $mcpUrl;
    }

    $envUrl = getenv('MCP_URL');
    if (!empty($envUrl)) {
      return $envUrl;
    }

    return self::DEFAULT_MCP_URL;
  }

  /**
   * Generate a unique request ID for MCP JSON-RPC calls.
   *
   * @return string
   *   A unique request identifier.
   */
  protected function generateRequestId(): string {
    return sprintf('drupal-%s-%s', $this->getConfig()->get('client_id') ?: 'unknown', bin2hex(random_bytes(8)));
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
