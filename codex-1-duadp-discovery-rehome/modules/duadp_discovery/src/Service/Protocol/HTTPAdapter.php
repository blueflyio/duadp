<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service\Protocol;

use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\RequestException;

/**
 * HTTP protocol adapter (fallback for standard REST APIs).
 *
 * Implements OSSA v0.3.2 HTTP protocol for agent communication.
 */
class HTTPAdapter implements ProtocolAdapterInterface {

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
   * Constructs an HTTPAdapter.
   *
   * @param \GuzzleHttp\ClientInterface $http_client
   *   The HTTP client.
   * @param \Drupal\Core\Logger\LoggerChannelFactoryInterface $logger_factory
   *   The logger factory.
   */
  public function __construct(
    ClientInterface $http_client,
    LoggerChannelFactoryInterface $logger_factory
  ) {
    $this->httpClient = $http_client;
    $this->logger = $logger_factory->get('ai_agents_client');
  }

  /**
   * {@inheritdoc}
   */
  public function getProtocolName(): string {
    return 'http';
  }

  /**
   * {@inheritdoc}
   */
  public function canHandle(array $manifest): bool {
    // Check if there's an explicit HTTP endpoint in protocols.
    if (isset($manifest['spec']['protocols'])) {
      foreach ($manifest['spec']['protocols'] as $protocol) {
        if (($protocol['type'] ?? '') === 'http' && isset($protocol['endpoint'])) {
          return TRUE;
        }
      }
    }

    // HTTP is NOT a fallback - only handle if explicitly configured.
    // Drupal agents should be handled by Drupal service invocation, not HTTP.
    return FALSE;
  }

  /**
   * {@inheritdoc}
   */
  public function invoke(
    array $manifest,
    string $capability,
    array $input,
    int $timeout
  ): array {
    $start_time = microtime(TRUE);

    try {
      $endpoint = $this->getEndpoint($manifest);
      if (!$endpoint) {
        throw new \RuntimeException('HTTP endpoint not found in agent manifest');
      }

      $capability_endpoint = rtrim($endpoint, '/') . '/capabilities/' . str_replace('_', '-', $capability);

      $response = $this->httpClient->post($capability_endpoint, [
        'json' => $input,
        'timeout' => $timeout,
        'headers' => [
          'Content-Type' => 'application/json',
        ],
      ]);

      $result = json_decode($response->getBody()->getContents(), TRUE);
      if (json_last_error() !== JSON_ERROR_NONE) {
        throw new \RuntimeException('Invalid JSON response: ' . json_last_error_msg());
      }
      $execution_time = microtime(TRUE) - $start_time;

      return [
        'success' => TRUE,
        'result' => $result,
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
        'error' => "HTTP invocation failed: {$e->getMessage()}",
        'execution_time' => $execution_time,
        'tokens_used' => 0,
      ];
    }
  }

  /**
   * {@inheritdoc}
   */
  public function discoverAgents(array $config = []): array {
    // HTTP doesn't have standard discovery.
    return [];
  }

  /**
   * {@inheritdoc}
   */
  public function checkHealth(array $manifest): array {
    $endpoint = $this->getEndpoint($manifest);
    if (!$endpoint) {
      return [
        'status' => 'unavailable',
        'response_time' => 0,
        'error' => 'HTTP endpoint not found',
      ];
    }

    $start_time = microtime(TRUE);

    try {
      $health_endpoint = rtrim($endpoint, '/') . '/health';
      $response = $this->httpClient->get($health_endpoint, [
        'timeout' => 5,
      ]);

      $response_time = (microtime(TRUE) - $start_time) * 1000;

      return [
        'status' => $response->getStatusCode() === 200 ? 'available' : 'unavailable',
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
   * Get HTTP endpoint from manifest.
   *
   * @param array $manifest
   *   Agent manifest.
   *
   * @return string|null
   *   Endpoint URL or NULL.
   */
  protected function getEndpoint(array $manifest): ?string {
    if (isset($manifest['spec']['protocols'])) {
      foreach ($manifest['spec']['protocols'] as $protocol) {
        if (($protocol['type'] ?? '') === 'http' && isset($protocol['endpoint'])) {
          return $protocol['endpoint'];
        }
      }
    }

    return NULL;
  }

}
