<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service\Protocol;

use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\RequestException;

/**
 * MCP (Model Context Protocol) adapter.
 *
 * Supports MCP servers for agent discovery and invocation.
 * Implements OSSA v0.3.2 multi-protocol communication.
 */
class MCPAdapter implements ProtocolAdapterInterface {

  /**
   * The HTTP client.
   *
   * @var \GuzzleHttp\ClientInterface
   */
  protected ClientInterface $httpClient;

  /**
   * The logger.
   *
   * @var \Drupal\Core\Logger\LoggerChannelInterface
   */
  protected $logger;

  /**
   * The config factory.
   *
   * @var \Drupal\Core\Config\ConfigFactoryInterface
   */
  protected ConfigFactoryInterface $configFactory;

  /**
   * Constructs an MCPAdapter.
   *
   * @param \GuzzleHttp\ClientInterface $http_client
   *   The HTTP client.
   * @param \Drupal\Core\Logger\LoggerChannelFactoryInterface $logger_factory
   *   The logger factory.
   * @param \Drupal\Core\Config\ConfigFactoryInterface $config_factory
   *   The config factory.
   */
  public function __construct(
    ClientInterface $http_client,
    LoggerChannelFactoryInterface $logger_factory,
    ConfigFactoryInterface $config_factory,
  ) {
    $this->httpClient = $http_client;
    $this->logger = $logger_factory->get('ai_agents_client');
    $this->configFactory = $config_factory;
  }

  /**
   * {@inheritdoc}
   */
  public function getProtocolName(): string {
    return 'mcp';
  }

  /**
   * {@inheritdoc}
   */
  public function canHandle(array $manifest): bool {
    // Check for MCP tools in manifest.
    if (isset($manifest['spec']['tools'])) {
      foreach ($manifest['spec']['tools'] as $tool) {
        if (($tool['source']['type'] ?? '') === 'mcp') {
          return TRUE;
        }
      }
    }

    // Check for MCP protocol declaration.
    if (isset($manifest['spec']['protocols'])) {
      foreach ($manifest['spec']['protocols'] as $protocol) {
        if (($protocol['type'] ?? '') === 'mcp') {
          return TRUE;
        }
      }
    }

    return FALSE;
  }

  /**
   * {@inheritdoc}
   */
  public function invoke(
    array $manifest,
    string $capability,
    array $input,
    int $timeout,
  ): array {
    $start_time = microtime(TRUE);

    try {
      $mcp_endpoint = $this->getMCPEndpoint($manifest);
      if (!$mcp_endpoint) {
        throw new \RuntimeException('MCP endpoint not found in manifest');
      }

      // MCP JSON-RPC 2.0 call.
      $request = [
        'jsonrpc' => '2.0',
        'method' => 'tools/call',
        'params' => [
          'name' => $capability,
          'arguments' => $input,
        ],
        'id' => uniqid('mcp_', TRUE),
      ];

      $response = $this->httpClient->post($mcp_endpoint, [
        'json' => $request,
        'timeout' => $timeout,
        'headers' => [
          'Content-Type' => 'application/json',
        ],
      ]);

      $result = json_decode($response->getBody()->getContents(), TRUE);
      if (json_last_error() !== JSON_ERROR_NONE) {
        throw new \RuntimeException('Invalid JSON response: ' . json_last_error_msg());
      }

      if (isset($result['error'])) {
        throw new \RuntimeException("MCP error: {$result['error']['message']}");
      }

      $execution_time = microtime(TRUE) - $start_time;

      return [
        'success' => TRUE,
        'result' => $result['result'] ?? [],
        'error' => NULL,
        'execution_time' => $execution_time,
        'tokens_used' => 0,
      ];
    }
    catch (RequestException $e) {
      $execution_time = microtime(TRUE) - $start_time;

      return [
        'success' => FALSE,
        'result' => NULL,
        'error' => "MCP invocation failed: {$e->getMessage()}",
        'execution_time' => $execution_time,
        'tokens_used' => 0,
      ];
    }
  }

  /**
   * {@inheritdoc}
   */
  public function discoverAgents(array $config = []): array {
    $mcp_server = $config['mcp_server']
      ?? $this->getGatewayUrl()
      ?? '';

    if (empty($mcp_server)) {
      $this->logger->warning('MCP discovery skipped: no gateway_url configured. Set it at /admin/config/ai-agents/client.');
      return [];
    }

    try {
      // MCP list_tools to discover agents.
      $request = [
        'jsonrpc' => '2.0',
        'method' => 'tools/list',
        'params' => [],
        'id' => uniqid('mcp_discover_', TRUE),
      ];

      $response = $this->httpClient->post("{$mcp_server}/mcp", [
        'json' => $request,
        'timeout' => 10,
      ]);

      $result = json_decode($response->getBody()->getContents(), TRUE);
      if (json_last_error() !== JSON_ERROR_NONE) {
        throw new \RuntimeException('Invalid JSON response: ' . json_last_error_msg());
      }
      $tools = $result['result']['tools'] ?? [];

      $agents = [];
      foreach ($tools as $tool) {
        if (str_contains($tool['name'] ?? '', 'agent_')) {
          $agents[] = [
            'name' => $tool['name'],
            'capabilities' => [$tool['name']],
            'protocol' => 'mcp',
            'endpoint' => $mcp_server,
          ];
        }
      }

      return $agents;
    }
    catch (\Exception $e) {
      $this->logger->warning('MCP discovery failed: @error', [
        '@error' => $e->getMessage(),
      ]);
      return [];
    }
  }

  /**
   * {@inheritdoc}
   */
  public function checkHealth(array $manifest): array {
    $mcp_endpoint = $this->getMCPEndpoint($manifest);
    if (!$mcp_endpoint) {
      return [
        'status' => 'unavailable',
        'response_time' => 0,
        'error' => 'MCP endpoint not found',
      ];
    }

    $start_time = microtime(TRUE);

    try {
      // MCP ping.
      $request = [
        'jsonrpc' => '2.0',
        'method' => 'ping',
        'params' => [],
        'id' => uniqid('mcp_ping_', TRUE),
      ];

      $response = $this->httpClient->post($mcp_endpoint, [
        'json' => $request,
        'timeout' => 5,
      ]);

      $response_time = (microtime(TRUE) - $start_time) * 1000;
      $result = json_decode($response->getBody()->getContents(), TRUE);
      if (json_last_error() !== JSON_ERROR_NONE) {
        throw new \RuntimeException('Invalid JSON response: ' . json_last_error_msg());
      }

      return [
        'status' => isset($result['result']) ? 'available' : 'unavailable',
        'response_time' => $response_time,
        'error' => NULL,
      ];
    }
    catch (\Exception $e) {
      $response_time = (microtime(TRUE) - $start_time) * 1000;

      return [
        'status' => 'unavailable',
        'response_time' => $response_time,
        'error' => $e->getMessage(),
      ];
    }
  }

  /**
   * Get MCP endpoint from manifest.
   *
   * @param array $manifest
   *   Agent manifest.
   *
   * @return string|null
   *   MCP endpoint URL or NULL.
   */
  protected function getMCPEndpoint(array $manifest): ?string {
    // Check tools for MCP source.
    if (isset($manifest['spec']['tools'])) {
      foreach ($manifest['spec']['tools'] as $tool) {
        if (($tool['source']['type'] ?? '') === 'mcp') {
          return $tool['source']['uri'] ?? NULL;
        }
      }
    }

    // Check protocols.
    if (isset($manifest['spec']['protocols'])) {
      foreach ($manifest['spec']['protocols'] as $protocol) {
        if (($protocol['type'] ?? '') === 'mcp' && isset($protocol['endpoint'])) {
          return $protocol['endpoint'];
        }
      }
    }

    return NULL;
  }

  /**
   * Get gateway URL from module configuration.
   *
   * @return string|null
   *   The configured gateway URL, or NULL if not set.
   */
  protected function getGatewayUrl(): ?string {
    $url = $this->configFactory->get('ai_agents_client.settings')->get('gateway_url');
    return !empty($url) ? $url : NULL;
  }

}
