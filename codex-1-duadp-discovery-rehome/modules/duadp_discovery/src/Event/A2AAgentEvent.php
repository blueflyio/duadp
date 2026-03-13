<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Event;

use Symfony\Contracts\EventDispatcher\Event;

/**
 * Event object for agent lifecycle events (registration, unregistration).
 *
 * Carries agent metadata through the Symfony event dispatcher so that
 * subscribers (including ECA) can react to agents joining or leaving
 * the communication network.
 */
class A2AAgentEvent extends Event {

  /**
   * The unique agent identifier.
   */
  protected string $agentId;

  /**
   * The human-readable agent name.
   */
  protected string $agentName;

  /**
   * The agent type (e.g., ossa, mcp, custom).
   */
  protected string $agentType;

  /**
   * The agent endpoint URL.
   */
  protected string $endpoint;

  /**
   * The agent capabilities list.
   *
   * @var array<int|string, mixed>
   */
  protected array $capabilities;

  /**
   * The lifecycle action that triggered this event.
   *
   * One of 'registered' or 'unregistered'.
   */
  protected string $action;

  /**
   * Constructs an A2AAgentEvent.
   *
   * @param string $agent_id
   *   The agent ID.
   * @param string $agent_name
   *   The agent name.
   * @param string $agent_type
   *   The agent type.
   * @param string $endpoint
   *   The agent endpoint URL.
   * @param array $capabilities
   *   The agent capabilities.
   * @param string $action
   *   The lifecycle action ('registered' or 'unregistered').
   */
  public function __construct(
    string $agent_id,
    string $agent_name,
    string $agent_type,
    string $endpoint = '',
    array $capabilities = [],
    string $action = 'registered',
  ) {
    $this->agentId = $agent_id;
    $this->agentName = $agent_name;
    $this->agentType = $agent_type;
    $this->endpoint = $endpoint;
    $this->capabilities = $capabilities;
    $this->action = $action;
  }

  /**
   * Gets the agent ID.
   */
  public function getAgentId(): string {
    return $this->agentId;
  }

  /**
   * Gets the agent name.
   */
  public function getAgentName(): string {
    return $this->agentName;
  }

  /**
   * Gets the agent type.
   */
  public function getAgentType(): string {
    return $this->agentType;
  }

  /**
   * Gets the agent endpoint URL.
   */
  public function getEndpoint(): string {
    return $this->endpoint;
  }

  /**
   * Gets the agent capabilities.
   *
   * @return array<int|string, mixed>
   */
  public function getCapabilities(): array {
    return $this->capabilities;
  }

  /**
   * Gets the lifecycle action.
   *
   * @return string
   *   Either 'registered' or 'unregistered'.
   */
  public function getAction(): string {
    return $this->action;
  }

  /**
   * Returns whether the agent was registered.
   */
  public function isRegistered(): bool {
    return $this->action === 'registered';
  }

  /**
   * Returns whether the agent was unregistered.
   */
  public function isUnregistered(): bool {
    return $this->action === 'unregistered';
  }

}
