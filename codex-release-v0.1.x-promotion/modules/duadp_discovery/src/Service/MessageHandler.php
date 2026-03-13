<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

use Drupal\bluefly_agent_platform\Event\A2AAgentEvent;
use Drupal\bluefly_agent_platform\Event\A2AMessageEvent;
use Drupal\bluefly_agent_platform\Event\A2AMessageEvents;
use Drupal\Core\Extension\ModuleHandlerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\EventDispatcherInterface;

/**
 * Service for handling incoming messages.
 */
class MessageHandler {

  /**
   * The agent registry service.
   *
   * @var \Drupal\bluefly_agent_platform\Service\AgentRegistry
   */
  protected AgentRegistry $registry;

  /**
   * The logger service.
   *
   * @var \Psr\Log\LoggerInterface
   */
  protected LoggerInterface $logger;

  /**
   * The module handler.
   *
   * @var \Drupal\Core\Extension\ModuleHandlerInterface
   */
  protected ModuleHandlerInterface $moduleHandler;

  /**
   * The event dispatcher.
   *
   * @var \Symfony\Component\EventDispatcher\EventDispatcherInterface
   */
  protected EventDispatcherInterface $eventDispatcher;

  /**
   * Constructs a MessageHandler object.
   */
  public function __construct(
    AgentRegistry $registry,
    LoggerInterface $logger,
    ModuleHandlerInterface $module_handler,
    EventDispatcherInterface $event_dispatcher
  ) {
    $this->registry = $registry;
    $this->logger = $logger;
    $this->moduleHandler = $module_handler;
    $this->eventDispatcher = $event_dispatcher;
  }

  /**
   * Handle an incoming message.
   *
   * @param array $message
   *   The message data.
   *
   * @return array
   *   Response to send back.
   */
  public function handle(array $message): array {
    if (!isset($message['type']) || !isset($message['from'])) {
      return [
        'error' => 'Invalid message format',
        'status' => 'error',
      ];
    }

    $this->logger->info('Received message from @from: @type', [
      '@from' => $message['from'],
      '@type' => $message['type'],
    ]);

    // Update sender heartbeat and dispatch heartbeat event.
    $this->registry->heartbeat($message['from']);
    $this->dispatchHeartbeatEvent($message['from']);

    // Allow other modules to handle the message.
    $this->moduleHandler->alter('ai_agents_communication_message', $message);

    // Default response.
    $response = [
      'status' => 'received',
      'message_id' => $message['id'] ?? NULL,
      'timestamp' => time(),
    ];

    // Handle based on message type.
    switch ($message['type']) {
      case 'ping':
        $response['status'] = 'pong';
        break;

      case 'task':
        $response = $this->handleTask($message);
        break;

      case 'query':
        $response = $this->handleQuery($message);
        break;

      case 'broadcast':
        $response = $this->handleBroadcast($message);
        break;

      default:
        $response['status'] = 'unknown_type';
    }

    // Dispatch MESSAGE_RECEIVED event.
    $messageEvent = new A2AMessageEvent(
      message_id: $message['id'] ?? uniqid('recv_', TRUE),
      from_agent: $message['from'],
      to_agent: $message['to'] ?? 'self',
      message_type: $message['type'],
      payload: $message['payload'] ?? $message,
      response: $response,
      status: $response['status'] ?? 'received',
    );
    $this->eventDispatcher->dispatch($messageEvent, A2AMessageEvents::MESSAGE_RECEIVED);

    return $response;
  }

  /**
   * Handle a task message.
   *
   * @param array $message
   *   The message data.
   *
   * @return array
   *   Response data.
   */
  protected function handleTask(array $message): array {
    // Implement task handling logic.
    return [
      'status' => 'task_received',
      'task_id' => $message['task_id'] ?? NULL,
    ];
  }

  /**
   * Handle a query message.
   *
   * @param array $message
   *   The message data.
   *
   * @return array
   *   Response data.
   */
  protected function handleQuery(array $message): array {
    // Implement query handling logic.
    return [
      'status' => 'query_processed',
      'result' => [],
    ];
  }

  /**
   * Handle a broadcast message.
   *
   * @param array $message
   *   The message data.
   *
   * @return array
   *   Response data.
   */
  protected function handleBroadcast(array $message): array {
    return [
      'status' => 'broadcast_received',
    ];
  }

  /**
   * Dispatches a heartbeat event for the given agent.
   *
   * @param string $agent_id
   *   The agent ID that sent the heartbeat.
   */
  protected function dispatchHeartbeatEvent(string $agent_id): void {
    $agent = $this->registry->getAgent($agent_id);
    $agentEvent = new A2AAgentEvent(
      agent_id: $agent_id,
      agent_name: $agent['agent_name'] ?? $agent_id,
      agent_type: $agent['agent_type'] ?? 'unknown',
      endpoint: $agent['endpoint_url'] ?? '',
      capabilities: $agent['capabilities'] ?? [],
      action: 'registered',
    );
    $this->eventDispatcher->dispatch($agentEvent, A2AMessageEvents::HEARTBEAT_RECEIVED);
  }

}
