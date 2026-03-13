<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Event;

/**
 * Defines event name constants for the A2A communication system.
 *
 * These events are dispatched by the MessageHandler, CommunicationClient,
 * and AgentRegistry services at key lifecycle points. They provide hooks
 * for modules like ECA, logging, and the OSSA validation subscriber.
 */
final class A2AMessageEvents {

  /**
   * Fired after a message has been successfully sent to another agent.
   *
   * @Event
   *
   * @var string
   */
  public const MESSAGE_SENT = 'ai_agents_communication.message.sent';

  /**
   * Fired when an incoming message has been received and processed.
   *
   * @Event
   *
   * @var string
   */
  public const MESSAGE_RECEIVED = 'ai_agents_communication.message.received';

  /**
   * Fired when message delivery or processing has failed.
   *
   * @Event
   *
   * @var string
   */
  public const MESSAGE_FAILED = 'ai_agents_communication.message.failed';

  /**
   * Fired when a new agent registers in the local registry.
   *
   * @Event
   *
   * @var string
   */
  public const AGENT_REGISTERED = 'ai_agents_communication.agent.registered';

  /**
   * Fired when an agent is removed from the local registry.
   *
   * @Event
   *
   * @var string
   */
  public const AGENT_UNREGISTERED = 'ai_agents_communication.agent.unregistered';

  /**
   * Fired after a broadcast message has been dispatched to multiple agents.
   *
   * @Event
   *
   * @var string
   */
  public const BROADCAST_SENT = 'ai_agents_communication.broadcast.sent';

  /**
   * Fired when an agent heartbeat (keep-alive) is received.
   *
   * @Event
   *
   * @var string
   */
  public const HEARTBEAT_RECEIVED = 'ai_agents_communication.heartbeat.received';

}
