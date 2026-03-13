<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

use Drupal\bluefly_agent_platform\Event\A2AMessageEvent;
use Drupal\bluefly_agent_platform\Event\A2AMessageEvents;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\http_client_manager\HttpClientManagerFactoryInterface;
use Drupal\key\KeyRepositoryInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\EventDispatcherInterface;

/**
 * Client for agent-to-agent communication.
 *
 * Uses http_client_manager for all outbound HTTP and key module for auth.
 */
class CommunicationClient {

  /**
   * The agent registry service.
   */
  protected AgentRegistry $registry;

  /**
   * The logger service.
   */
  protected LoggerInterface $logger;

  /**
   * The config factory.
   */
  protected ConfigFactoryInterface $configFactory;

  /**
   * The key repository.
   */
  protected ?KeyRepositoryInterface $keyRepository;

  /**
   * The event dispatcher.
   */
  protected EventDispatcherInterface $eventDispatcher;

  /**
   * The HTTP client manager factory.
   */
  protected HttpClientManagerFactoryInterface $httpClientFactory;

  /**
   * Constructs a CommunicationClient object.
   *
   * @param \Drupal\http_client_manager\HttpClientManagerFactoryInterface $httpClientFactory
   *   The HTTP client manager factory.
   * @param \Drupal\bluefly_agent_platform\Service\AgentRegistry $registry
   *   The agent registry.
   * @param \Psr\Log\LoggerInterface $logger
   *   The logger.
   * @param \Drupal\Core\Config\ConfigFactoryInterface $configFactory
   *   The config factory.
   * @param \Symfony\Component\EventDispatcher\EventDispatcherInterface $eventDispatcher
   *   The event dispatcher.
   * @param \Drupal\key\KeyRepositoryInterface|null $keyRepository
   *   The key repository.
   */
  public function __construct(
    HttpClientManagerFactoryInterface $httpClientFactory,
    AgentRegistry $registry,
    LoggerInterface $logger,
    ConfigFactoryInterface $configFactory,
    EventDispatcherInterface $eventDispatcher,
    ?KeyRepositoryInterface $keyRepository = NULL,
  ) {
    $this->httpClientFactory = $httpClientFactory;
    $this->registry = $registry;
    $this->logger = $logger;
    $this->configFactory = $configFactory;
    $this->eventDispatcher = $eventDispatcher;
    $this->keyRepository = $keyRepository;
  }

  /**
   * Gets the underlying Guzzle client from http_client_manager.
   *
   * @return \GuzzleHttp\ClientInterface
   *   The HTTP client.
   */
  protected function getHttpClient(): \GuzzleHttp\ClientInterface {
    return $this->httpClientFactory->get('a2a_protocol')->getHttpClient();
  }

  /**
   * Send a message to another agent.
   *
   * @param string $agent_id
   *   Target agent ID.
   * @param array $message
   *   Message payload.
   *
   * @return array
   *   Response from target agent.
   */
  public function send(string $agent_id, array $message): array {
    $agent = $this->registry->getAgent($agent_id);
    $message_id = $message['id'] ?? uniqid('msg_', TRUE);
    $message_type = $message['type'] ?? 'unknown';
    $from_agent = $message['from'] ?? 'self';

    if (!$agent) {
      $this->logger->error('Agent not found: @agent_id', [
        '@agent_id' => $agent_id,
      ]);

      $error_response = ['error' => 'Agent not found'];

      // Dispatch MESSAGE_FAILED event.
      $event = new A2AMessageEvent(
        message_id: $message_id,
        from_agent: $from_agent,
        to_agent: $agent_id,
        message_type: $message_type,
        payload: $message['payload'] ?? $message,
        response: $error_response,
        status: 'failed',
        error: 'Agent not found',
      );
      $this->eventDispatcher->dispatch($event, A2AMessageEvents::MESSAGE_FAILED);

      return $error_response;
    }

    try {
      $httpClient = $this->getHttpClient();
      $response = $httpClient->request('POST', $agent['endpoint_url'] . '/message', [
        'json' => $message,
        'headers' => $this->getAuthHeaders(),
        'timeout' => 30,
      ]);

    $lastException = NULL;

    for ($attempt = 0; $attempt <= $maxRetries; $attempt++) {
      try {
        if ($attempt > 0) {
          // Exponential backoff: delay * 2^(attempt-1).
          $delayMs = $retryDelay * (int) pow(2, $attempt - 1);
          usleep($delayMs * 1000);
          $this->logger->info('Retrying message to @agent_id (attempt @attempt/@max)', [
            '@agent_id' => $agent_id,
            '@attempt' => $attempt,
            '@max' => $maxRetries,
          ]);
        }

        $response = $this->httpClientManagerFactory->get('a2a_protocol')->request('POST', $agent['endpoint_url'] . '/message', [
          'json' => $message,
          'headers' => $this->getAuthHeaders(),
          'timeout' => $timeout,
          'connect_timeout' => $timeout,
        ]);

        $body = json_decode($response->getBody()->getContents(), TRUE);

        $this->logger->info('Message sent to @agent_id', [
          '@agent_id' => $agent_id,
        ]);

        // Dispatch MESSAGE_SENT event.
        $event = new A2AMessageEvent(
          message_id: $message_id,
          from_agent: $from_agent,
          to_agent: $agent_id,
          message_type: $message_type,
          payload: $message['payload'] ?? $message,
          response: $body ?? [],
          status: $body['status'] ?? 'sent',
        );
        $this->eventDispatcher->dispatch($event, A2AMessageEvents::MESSAGE_SENT);

        // Forward to A2A collector if resolver is available.
        $this->forwardToCollector($message_id, $from_agent, $agent_id, $message_type, $message);

        return $body;
      }
      catch (ConnectException | ServerException $e) {
        // Transient failures: retry.
        $lastException = $e;
        $this->logger->warning('Transient error sending to @agent_id (attempt @attempt): @message', [
          '@agent_id' => $agent_id,
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

    $errorMessage = $lastException ? $lastException->getMessage() : 'Unknown error';
    $this->logger->error('Failed to send message to @agent_id after @attempts attempts: @message', [
      '@agent_id' => $agent_id,
      '@attempts' => $maxRetries + 1,
      '@message' => $errorMessage,
    ]);

    $error_response = ['error' => $errorMessage];

    // Dispatch MESSAGE_FAILED event.
    $event = new A2AMessageEvent(
      message_id: $message_id,
      from_agent: $from_agent,
      to_agent: $agent_id,
      message_type: $message_type,
      payload: $message['payload'] ?? $message,
      response: $error_response,
      status: 'failed',
      error: $errorMessage,
    );
    $this->eventDispatcher->dispatch($event, A2AMessageEvents::MESSAGE_FAILED);

    return $error_response;
  }

  /**
   * Broadcast a message to multiple agents.
   *
   * @param array $agent_ids
   *   Array of target agent IDs.
   * @param array $message
   *   Message payload.
   *
   * @return array
   *   Array of responses keyed by agent ID.
   */
  public function broadcast(array $agent_ids, array $message): array {
    $responses = [];

    foreach ($agent_ids as $agent_id) {
      $responses[$agent_id] = $this->send($agent_id, $message);
    }

    // Dispatch BROADCAST_SENT event with summary information.
    $broadcast_id = $message['id'] ?? uniqid('bcast_', TRUE);
    $successful = array_filter($responses, static fn($r) => !isset($r['error']));

    $broadcastEvent = new A2AMessageEvent(
      message_id: $broadcast_id,
      from_agent: $message['from'] ?? 'self',
      to_agent: implode(',', $agent_ids),
      message_type: 'broadcast',
      payload: $message['payload'] ?? $message,
      response: [
        'recipients' => count($agent_ids),
        'successful' => count($successful),
        'failed' => count($agent_ids) - count($successful),
      ],
      status: count($successful) === count($agent_ids) ? 'sent' : 'partial',
    );
    $this->eventDispatcher->dispatch($broadcastEvent, A2AMessageEvents::BROADCAST_SENT);

    return $responses;
  }

  /**
   * Get authentication headers using key module.
   *
   * @return array
   *   Array of headers.
   */
  protected function getAuthHeaders(): array {
    $headers = [
      'Content-Type' => 'application/json',
      'User-Agent' => 'Drupal AI Agents Communication/1.0',
    ];

    // Add authentication if key is configured.
    if ($this->keyRepository) {
      $config = $this->configFactory->get('ai_agents_communication.settings');
      $key_id = $config->get('auth_key');

      if ($key_id) {
        $key = $this->keyRepository->getKey($key_id);
        if ($key) {
          $headers['Authorization'] = 'Bearer ' . $key->getKeyValue();
        }
      }
    }

    return $headers;
  }

  /**
   * Forwards message metadata to the A2A collector for observability.
   *
   * Uses the a2a_collector http_client_manager API (PostLog) with the
   * collector schema: messageId, fromAgent, toAgent, messageType, payload,
   * timestamp (ISO 8601). Fire-and-forget; failures are logged but do not
   * affect the primary message delivery.
   *
   * @param string $message_id
   *   The message ID.
   * @param string $from_agent
   *   The sender agent ID.
   * @param string $to_agent
   *   The receiver agent ID.
   * @param string $message_type
   *   The message type.
   * @param array $message
   *   The original message payload.
   */
  protected function forwardToCollector(
    string $message_id,
    string $from_agent,
    string $to_agent,
    string $message_type,
    array $message,
  ): void {
    if (!$this->endpointResolver || empty($this->endpointResolver->getA2aCollectorUrl())) {
      return;
    }

    try {
      $collectorClient = $this->httpClientManagerFactory->get('a2a_collector');
      $collectorClient->call('PostLog', [
        'messageId' => $message_id,
        'fromAgent' => $from_agent,
        'toAgent' => $to_agent,
        'messageType' => $message_type,
        'payload' => $message['payload'] ?? $message,
        'timestamp' => (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format(\DateTimeInterface::ATOM),
      ]);
    }
    catch (\Exception $e) {
      $this->logger->debug('A2A collector forward failed: @message', [
        '@message' => $e->getMessage(),
      ]);
    }
  }

}
