<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Event;

use Drupal\Component\EventDispatcher\Event;

/**
 * Event dispatched during gateway task lifecycle.
 */
class GatewayTaskEvent extends Event {

  /**
   * The task ID.
   */
  protected string $taskId;

  /**
   * The task type.
   */
  protected string $taskType;

  /**
   * The agent ID handling the task.
   */
  protected string $agentId;

  /**
   * The task payload.
   */
  protected array $payload;

  /**
   * The task result.
   */
  protected ?array $result;

  /**
   * Error message if the task failed.
   */
  protected ?string $errorMessage;

  /**
   * The gateway endpoint.
   */
  protected string $gateway;

  /**
   * Constructs a GatewayTaskEvent.
   *
   * @param string $task_id
   *   The task ID.
   * @param string $task_type
   *   The task type.
   * @param string $agent_id
   *   The agent ID.
   * @param array $payload
   *   The task payload.
   * @param string $gateway
   *   The gateway endpoint.
   * @param array|null $result
   *   The task result.
   * @param string|null $error_message
   *   Error message if failed.
   */
  public function __construct(
    string $task_id,
    string $task_type,
    string $agent_id = '',
    array $payload = [],
    string $gateway = '',
    ?array $result = NULL,
    ?string $error_message = NULL,
  ) {
    $this->taskId = $task_id;
    $this->taskType = $task_type;
    $this->agentId = $agent_id;
    $this->payload = $payload;
    $this->gateway = $gateway;
    $this->result = $result;
    $this->errorMessage = $error_message;
  }

  /**
   * Gets the task ID.
   */
  public function getTaskId(): string {
    return $this->taskId;
  }

  /**
   * Gets the task type.
   */
  public function getTaskType(): string {
    return $this->taskType;
  }

  /**
   * Gets the agent ID.
   */
  public function getAgentId(): string {
    return $this->agentId;
  }

  /**
   * Gets the task payload.
   */
  public function getPayload(): array {
    return $this->payload;
  }

  /**
   * Sets the task payload.
   */
  public function setPayload(array $payload): void {
    $this->payload = $payload;
  }

  /**
   * Gets the task result.
   */
  public function getResult(): ?array {
    return $this->result;
  }

  /**
   * Sets the task result.
   */
  public function setResult(array $result): void {
    $this->result = $result;
  }

  /**
   * Gets the gateway endpoint.
   */
  public function getGateway(): string {
    return $this->gateway;
  }

  /**
   * Gets the error message.
   */
  public function getErrorMessage(): ?string {
    return $this->errorMessage;
  }

  /**
   * Checks if the task was successful.
   */
  public function isSuccessful(): bool {
    return $this->errorMessage === NULL && $this->result !== NULL;
  }

}
