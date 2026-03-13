<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Model;

/**
 * Value object representing an A2A Task Status.
 */
final class TaskStatus implements \JsonSerializable {

  /**
   * Task state constants matching the A2A spec.
   */
  public const STATE_SUBMITTED = 'submitted';
  public const STATE_WORKING = 'working';
  public const STATE_INPUT_REQUIRED = 'input-required';
  public const STATE_COMPLETED = 'completed';
  public const STATE_FAILED = 'failed';
  public const STATE_CANCELED = 'canceled';
  public const STATE_AUTH_REQUIRED = 'auth-required';
  public const STATE_REJECTED = 'rejected';

  /**
   * Valid states.
   */
  public const VALID_STATES = [
    self::STATE_SUBMITTED,
    self::STATE_WORKING,
    self::STATE_INPUT_REQUIRED,
    self::STATE_COMPLETED,
    self::STATE_FAILED,
    self::STATE_CANCELED,
    self::STATE_AUTH_REQUIRED,
    self::STATE_REJECTED,
  ];

  /**
   * Terminal states (no further transitions).
   */
  public const TERMINAL_STATES = [
    self::STATE_COMPLETED,
    self::STATE_FAILED,
    self::STATE_CANCELED,
    self::STATE_REJECTED,
  ];

  /**
   * Constructs a TaskStatus.
   *
   * @param string $state
   *   Task state (one of VALID_STATES).
   * @param string|null $message
   *   Human-readable status message.
   * @param string|null $timestamp
   *   ISO 8601 timestamp.
   */
  public function __construct(
    public readonly string $state,
    public readonly ?string $message = NULL,
    public readonly ?string $timestamp = NULL,
  ) {
    if (!in_array($state, self::VALID_STATES, TRUE)) {
      throw new \InvalidArgumentException("Invalid task state: $state");
    }
  }

  /**
   * Check if this status is in a terminal state.
   */
  public function isTerminal(): bool {
    return in_array($this->state, self::TERMINAL_STATES, TRUE);
  }

  /**
   * {@inheritdoc}
   */
  public function jsonSerialize(): array {
    $data = ['state' => $this->state];

    if ($this->message !== NULL) {
      $data['message'] = $this->message;
    }
    if ($this->timestamp !== NULL) {
      $data['timestamp'] = $this->timestamp;
    }

    return $data;
  }

}
