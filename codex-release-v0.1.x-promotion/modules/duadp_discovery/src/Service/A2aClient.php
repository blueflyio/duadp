<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

use Drupal\bluefly_agent_platform\Model\A2aMessage;
use Drupal\bluefly_agent_platform\Model\AgentCard;
use Drupal\bluefly_agent_platform\Model\Skill;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\http_client_manager\HttpClientInterface;
use Drupal\http_client_manager\HttpClientManagerFactoryInterface;
use Drupal\key\KeyRepositoryInterface;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Exception\ServerException;
use Psr\Log\LoggerInterface;

/**
 * HTTP client for outbound A2A protocol calls using http_client_manager.
 *
 * Uses PlatformEndpointResolver for 3-tier URL resolution
 * (env var > config > default) and supports configurable timeout
 * and retry settings from platform infrastructure config.
 */
class A2aClient {

  /**
   * The logger channel.
   */
  protected LoggerInterface $logger;

  /**
   * The HTTP client from http_client_manager.
   */
  protected HttpClientInterface $httpClient;

  /**
   * Constructs an A2aClient object.
   *
   * @param \Drupal\http_client_manager\HttpClientManagerFactoryInterface $httpClientFactory
   *   The HTTP client manager factory.
   * @param \Drupal\key\KeyRepositoryInterface $keyRepository
   *   The key repository.
   * @param \Drupal\Core\Logger\LoggerChannelFactoryInterface $loggerFactory
   *   The logger channel factory.
   * @param \Drupal\bluefly_agent_platform\Service\PlatformEndpointResolver|null $endpointResolver
   *   The platform endpoint resolver (optional for backward compatibility).
   */
  public function __construct(
    protected readonly HttpClientManagerFactoryInterface $httpClientFactory,
    protected readonly KeyRepositoryInterface $keyRepository,
    LoggerChannelFactoryInterface $loggerFactory,
    protected readonly ?PlatformEndpointResolver $endpointResolver = NULL,
  ) {
    $this->logger = $loggerFactory->get('ai_agents_communication');
    $this->httpClient = $this->httpClientFactory->get('a2a_protocol');
  }

  /**
   * Discover a remote agent by fetching its Agent Card.
   *
   * @param string $baseUrl
   *   The base URL of the remote agent.
   *
   * @return \Drupal\bluefly_agent_platform\Model\AgentCard|null
   *   The agent card or NULL on failure.
   */
  public function discoverAgent(string $baseUrl): ?AgentCard {
    try {
      $result = $this->httpClient->call('DiscoverAgent', [
        'base_url' => rtrim($baseUrl, '/') . '/',
      ]);

      $data = $result->toArray();

      if (empty($data['name'])) {
        return NULL;
      }

      $skills = [];
      foreach ($data['skills'] ?? [] as $skill) {
        $skills[] = new Skill(
          id: $skill['id'] ?? '',
          name: $skill['name'] ?? '',
          description: $skill['description'] ?? '',
          tags: $skill['tags'] ?? [],
          examples: $skill['examples'] ?? [],
        );
      }

      return new AgentCard(
        name: $data['name'],
        url: $data['url'] ?? $baseUrl . '/a2a',
        version: $data['version'] ?? '1.0',
        skills: $skills,
        description: $data['description'] ?? '',
        capabilities: $data['capabilities'] ?? NULL,
        authentication: $data['authentication'] ?? NULL,
      );
    }
    catch (GuzzleException $e) {
      $this->logger->error('Failed to discover agent at @url: @message', [
        '@url' => $baseUrl,
        '@message' => $e->getMessage(),
      ]);
      return NULL;
    }
  }

  /**
   * Discover agents registered in the platform mesh.
   *
   * Uses the Agent Mesh discovery API to find agents across the platform.
   * The mesh URL is resolved via the 3-tier strategy (env > config > default).
   *
   * @return array|null
   *   Array of discovered agents or NULL on failure.
   */
  public function discoverMeshAgents(): ?array {
    $meshUrl = $this->resolveEndpoint('mesh_url');
    if (empty($meshUrl)) {
      $this->logger->warning('Mesh URL not configured; cannot discover mesh agents.');
      return NULL;
    }

    try {
      $result = $this->httpClient->call('DiscoverAgent', [
        'base_url' => rtrim($meshUrl, '/') . '/api/v1/discovery',
      ]);
      return $result->toArray();
    }
    catch (\Exception $e) {
      $this->logger->error('Failed to discover mesh agents at @url: @message', [
        '@url' => $meshUrl,
        '@message' => $e->getMessage(),
      ]);
      return NULL;
    }
  }

  /**
   * Send a message to a remote A2A agent.
   *
   * @param string $endpointUrl
   *   The A2A endpoint URL.
   * @param \Drupal\bluefly_agent_platform\Model\A2aMessage $message
   *   The message to send.
   * @param string|null $authKeyId
   *   Key module key ID for Bearer auth.
   *
   * @return array|null
   *   The JSON-RPC result or NULL on failure.
   */
  public function sendMessage(string $endpointUrl, A2aMessage $message, ?string $authKeyId = NULL): ?array {
    return $this->rpcCall($endpointUrl, 'message/send', [
      'message' => $message->jsonSerialize(),
    ], $authKeyId);
  }

  /**
   * Get a task from a remote A2A agent.
   */
  public function getTask(string $endpointUrl, string $taskId, ?string $authKeyId = NULL): ?array {
    return $this->rpcCall($endpointUrl, 'tasks/get', [
      'id' => $taskId,
    ], $authKeyId);
  }

  /**
   * Cancel a task on a remote A2A agent.
   */
  public function cancelTask(string $endpointUrl, string $taskId, ?string $authKeyId = NULL): ?array {
    return $this->rpcCall($endpointUrl, 'tasks/cancel', [
      'id' => $taskId,
    ], $authKeyId);
  }

  /**
   * Forward a log entry to the A2A collector for observability.
   *
   * Uses the a2a_collector http_client_manager API (PostLog) with the
   * collector schema: messageId, fromAgent, toAgent, messageType, payload,
   * timestamp (ISO 8601). Fire-and-forget: failures are logged but do not
   * propagate.
   *
   * @param array $logEntry
   *   Log entry with keys messageId (or message_id), fromAgent (or from),
   *   toAgent (or to), messageType (or type), payload, timestamp (ISO or unix).
   */
  public function forwardToCollector(array $logEntry): void {
    $collectorUrl = $this->resolveEndpoint('a2a_collector_url');
    if (empty($collectorUrl)) {
      return;
    }

    $messageId = $logEntry['messageId'] ?? $logEntry['message_id'] ?? null;
    $fromAgent = $logEntry['fromAgent'] ?? $logEntry['from'] ?? 'unknown';
    $toAgent = $logEntry['toAgent'] ?? $logEntry['to'] ?? 'unknown';
    $messageType = $logEntry['messageType'] ?? $logEntry['type'] ?? 'event';
    $payload = $logEntry['payload'] ?? $logEntry;
    $ts = $logEntry['timestamp'] ?? null;
    if (is_numeric($ts)) {
      $timestamp = (new \DateTimeImmutable('@' . (int) $ts, new \DateTimeZone('UTC')))->format(\DateTimeInterface::ATOM);
    }
    elseif (is_string($ts)) {
      $timestamp = $ts;
    }
    else {
      $timestamp = (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format(\DateTimeInterface::ATOM);
    }
    if ($messageId === null || $messageId === '') {
      $messageId = uniqid('a2a_', TRUE);
    }

    try {
      $collectorClient = $this->httpClientFactory->get('a2a_collector');
      $collectorClient->call('PostLog', [
        'messageId' => $messageId,
        'fromAgent' => $fromAgent,
        'toAgent' => $toAgent,
        'messageType' => $messageType,
        'payload' => $payload,
        'timestamp' => $timestamp,
        'priority' => $logEntry['priority'] ?? NULL,
        'direction' => $logEntry['direction'] ?? NULL,
        'correlationId' => $logEntry['correlationId'] ?? $logEntry['correlation_id'] ?? NULL,
      ]);
    }
    catch (\Exception $e) {
      $this->logger->debug('A2A collector forward failed: @message', [
        '@message' => $e->getMessage(),
      ]);
    }
  }

  /**
   * Resolves a platform endpoint URL using the 3-tier strategy.
   *
   * @param string $key
   *   The endpoint key (e.g. 'a2a_collector_url', 'mesh_url').
   *
   * @return string
   *   The resolved URL.
   */
  public function resolveEndpoint(string $key): string {
    if ($this->endpointResolver) {
      return $this->endpointResolver->resolve($key);
    }

    // Fallback defaults when resolver is not injected.
    $defaults = PlatformEndpointResolver::getDefaults();
    return $defaults[$key] ?? '';
  }

  /**
   * Returns all resolved platform endpoint information.
   *
   * Useful for diagnostics and health checks.
   *
   * @return array
   *   Resolved endpoint data.
   */
  public function getPlatformEndpoints(): array {
    if ($this->endpointResolver) {
      return $this->endpointResolver->getAllResolved();
    }
    return PlatformEndpointResolver::getDefaults();
  }

  /**
   * Execute a JSON-RPC call via http_client_manager with retry support.
   */
  protected function rpcCall(string $endpointUrl, string $method, array $params, ?string $authKeyId = NULL): ?array {
    $headers = [];
    if ($authKeyId) {
      $key = $this->keyRepository->getKey($authKeyId);
      if ($key) {
        $headers['Authorization'] = 'Bearer ' . $key->getKeyValue();
      }
    }

    $operationName = match ($method) {
      'message/send' => 'SendMessage',
      'tasks/get' => 'GetTask',
      'tasks/cancel' => 'CancelTask',
      default => 'SendMessage',
    };

    $maxRetries = $this->endpointResolver
      ? $this->endpointResolver->getMaxRetries()
      : 3;
    $retryDelay = $this->endpointResolver
      ? $this->endpointResolver->getRetryDelay()
      : 1000;

    $lastException = NULL;

    for ($attempt = 0; $attempt <= $maxRetries; $attempt++) {
      try {
        if ($attempt > 0) {
          // Exponential backoff: delay * 2^(attempt-1).
          $delayMs = $retryDelay * (int) pow(2, $attempt - 1);
          usleep($delayMs * 1000);
          $this->logger->info('Retrying A2A RPC @method (attempt @attempt/@max)', [
            '@method' => $method,
            '@attempt' => $attempt,
            '@max' => $maxRetries,
          ]);
        }

        $result = $this->httpClient->call($operationName, [
          'base_url' => $endpointUrl,
          'jsonrpc' => '2.0',
          'method' => $method,
          'params' => $params,
          'id' => uniqid('a2a_', TRUE),
        ] + $headers);

        $data = $result->toArray();

        if (isset($data['error'])) {
          $this->logger->error('A2A RPC error: @code @message', [
            '@code' => $data['error']['code'] ?? 0,
            '@message' => $data['error']['message'] ?? 'Unknown',
          ]);
          return NULL;
        }

        return $data['result'] ?? NULL;
      }
      catch (ConnectException | ServerException $e) {
        // Transient failures: retry.
        $lastException = $e;
        $this->logger->warning('Transient A2A RPC error (attempt @attempt): @message', [
          '@attempt' => $attempt + 1,
          '@message' => $e->getMessage(),
        ]);
        continue;
      }
      catch (\Exception $e) {
        // Non-transient failure: do not retry.
        $lastException = $e;
        break;
      }
    }

    $this->logger->error('A2A RPC call @method failed after @attempts attempts: @message', [
      '@method' => $method,
      '@attempts' => $maxRetries + 1,
      '@message' => $lastException ? $lastException->getMessage() : 'Unknown error',
    ]);
    return NULL;
  }

}
