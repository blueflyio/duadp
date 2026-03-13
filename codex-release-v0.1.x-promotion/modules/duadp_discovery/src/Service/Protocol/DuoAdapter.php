<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service\Protocol;

use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\GuzzleException;

/**
 * GitLab Duo protocol adapter.
 *
 * Routes tasks to GitLab Duo agents via agent-mesh /v1/duo/route.
 * Handles manifests with spec.protocols[].type === 'gitlab-duo'.
 */
class DuoAdapter implements ProtocolAdapterInterface {

  /**
   * HTTP client.
   *
   * @var \GuzzleHttp\ClientInterface
   */
  protected ClientInterface $httpClient;

  /**
   * Config factory.
   *
   * @var \Drupal\Core\Config\ConfigFactoryInterface
   */
  protected ConfigFactoryInterface $configFactory;

  /**
   * Logger.
   *
   * @var \Drupal\Core\Logger\LoggerChannelInterface
   */
  protected $logger;

  /**
   * Constructs a DuoAdapter.
   *
   * @param \GuzzleHttp\ClientInterface $http_client
   *   The HTTP client.
   * @param \Drupal\Core\Config\ConfigFactoryInterface $config_factory
   *   The config factory.
   * @param \Drupal\Core\Logger\LoggerChannelFactoryInterface $logger_factory
   *   The logger factory.
   */
  public function __construct(
    ClientInterface $http_client,
    ConfigFactoryInterface $config_factory,
    LoggerChannelFactoryInterface $logger_factory,
  ) {
    $this->httpClient = $http_client;
    $this->configFactory = $config_factory;
    $this->logger = $logger_factory->get('ai_agents_client');
  }

  /**
   * {@inheritdoc}
   */
  public function getProtocolName(): string {
    return 'gitlab-duo';
  }

  /**
   * {@inheritdoc}
   */
  public function canHandle(array $manifest): bool {
    if (isset($manifest['spec']['protocols'])) {
      foreach ($manifest['spec']['protocols'] as $protocol) {
        if (($protocol['type'] ?? '') === 'gitlab-duo') {
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
    int $timeout
  ): array {
    $start = microtime(TRUE);
    $url = $this->getDuoRouteUrl();
    if (!$url) {
      return [
        'success' => FALSE,
        'error' => 'Duo route URL not configured',
        'execution_time' => 0,
        'tokens_used' => 0,
      ];
    }

    try {
      $payload = [
        'event' => $capability ?: ($manifest['metadata']['name'] ?? 'trigger'),
        'input' => json_encode($input),
      ];
      $response = $this->httpClient->post($url, [
        'json' => $payload,
        'timeout' => $timeout,
        'headers' => ['Content-Type' => 'application/json', 'Accept' => 'application/json'],
      ]);
      $body = json_decode($response->getBody()->getContents(), TRUE);
      return [
        'success' => $response->getStatusCode() >= 200 && $response->getStatusCode() < 300,
        'result' => $body,
        'execution_time' => microtime(TRUE) - $start,
        'tokens_used' => 0,
      ];
    }
    catch (GuzzleException $e) {
      $this->logger->warning('Duo invoke failed: @msg', ['@msg' => $e->getMessage()]);
      return [
        'success' => FALSE,
        'error' => $e->getMessage(),
        'execution_time' => microtime(TRUE) - $start,
        'tokens_used' => 0,
      ];
    }
  }

  /**
   * {@inheritdoc}
   */
  public function discoverAgents(array $config = []): array {
    return [];
  }

  /**
   * {@inheritdoc}
   */
  public function checkHealth(array $manifest): array {
    $url = $this->getDuoRouteUrl();
    if (!$url) {
      return ['status' => 'unconfigured', 'response_time' => 0, 'error' => 'No Duo URL'];
    }
    $base = preg_replace('#/v1/duo/route$#', '', $url);
    $start = microtime(TRUE);
    try {
      $response = $this->httpClient->get($base . '/health', ['timeout' => 5]);
      return [
        'status' => $response->getStatusCode() === 200 ? 'healthy' : 'unhealthy',
        'response_time' => microtime(TRUE) - $start,
        'error' => NULL,
      ];
    }
    catch (GuzzleException $e) {
      return [
        'status' => 'unhealthy',
        'response_time' => microtime(TRUE) - $start,
        'error' => $e->getMessage(),
      ];
    }
  }

  /**
   * Gets the Duo route URL from config.
   *
   * @return string|null
   *   URL or NULL if not set.
   */
  protected function getDuoRouteUrl(): ?string {
    $config = $this->configFactory->get('ai_agents_client.settings');
    $duo = $config->get('duo_route_url');
    if ($duo !== NULL && $duo !== '') {
      return rtrim($duo, '/');
    }
    $gateway = $config->get('gateway_url');
    if ($gateway !== NULL && $gateway !== '') {
      return rtrim($gateway, '/') . '/v1/duo/route';
    }
    return NULL;
  }

}
