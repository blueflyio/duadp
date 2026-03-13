<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Event;

use Symfony\Contracts\EventDispatcher\Event;

/**
 * Event object for A2A message lifecycle events.
 *
 * Carries message context (sender, receiver, type, payload) through the
 * Symfony event dispatcher. Used by the ECA event plugin to expose token
 * data for conditions and actions.
 */
class A2AMessageEvent extends Event {

  /**
   * The unique message identifier.
   */
  protected string $messageId;

  /**
   * The sending agent ID.
   */
  protected string $fromAgent;

  /**
   * The receiving agent ID.
   */
  protected string $toAgent;

  /**
   * The message type (e.g., task, query, ping, broadcast).
   */
  protected string $messageType;

  /**
   * The message payload.
   *
   * @var array<string, mixed>
   */
  protected array $payload;

  /**
   * The response data from the receiving agent, if available.
   *
   * @var array<string, mixed>
   */
  protected array $response;

  /**
   * The delivery/processing status.
   */
  protected string $status;

  /**
   * Error message if the operation failed.
   */
  protected string $error;

  /**
   * Constructs an A2AMessageEvent.
   *
   * @param string $message_id
   *   The unique message identifier.
   * @param string $from_agent
   *   The sending agent ID.
   * @param string $to_agent
   *   The receiving agent ID.
   * @param string $message_type
   *   The message type.
   * @param array $payload
   *   The message payload.
   * @param array $response
   *   The response data.
   * @param string $status
   *   The delivery status.
   * @param string $error
   *   An error message if delivery failed.
   */
  public function __construct(
    string $message_id,
    string $from_agent,
    string $to_agent,
    string $message_type,
    array $payload = [],
    array $response = [],
    string $status = 'sent',
    string $error = '',
  ) {
    $this->messageId = $message_id;
    $this->fromAgent = $from_agent;
    $this->toAgent = $to_agent;
    $this->messageType = $message_type;
    $this->payload = $payload;
    $this->response = $response;
    $this->status = $status;
    $this->error = $error;
  }

  /**
   * Gets the message ID.
   */
  public function getMessageId(): string {
    return $this->messageId;
  }

  /**
   * Gets the sending agent ID.
   */
  public function getFromAgent(): string {
    return $this->fromAgent;
  }

  /**
   * Gets the receiving agent ID.
   */
  public function getToAgent(): string {
    return $this->toAgent;
  }

  /**
   * Gets the message type.
   */
  public function getMessageType(): string {
    return $this->messageType;
  }

  /**
   * Gets the message payload.
   *
   * @return array<string, mixed>
   */
  public function getPayload(): array {
    return $this->payload;
  }

  /**
   * Gets the response data.
   *
   * @return array<string, mixed>
   */
  public function getResponse(): array {
    return $this->response;
  }

  /**
   * Sets the response data.
   *
   * @param array $response
   *   The response data.
   */
  public function setResponse(array $response): void {
    $this->response = $response;
  }

  /**
   * Gets the status.
   */
  public function getStatus(): string {
    return $this->status;
  }

  /**
   * Sets the status.
   *
   * @param string $status
   *   The new status.
   */
  public function setStatus(string $status): void {
    $this->status = $status;
  }

  /**
   * Gets the error message.
   */
  public function getError(): string {
    return $this->error;
  }

  /**
   * Returns whether the delivery was successful.
   */
  public function isSuccessful(): bool {
    return empty($this->error) && !in_array($this->status, ['error', 'failed'], TRUE);
  }

  /**
   * Returns whether there is a response from the target agent.
   */
  public function hasResponse(): bool {
    return !empty($this->response);
  }

}
