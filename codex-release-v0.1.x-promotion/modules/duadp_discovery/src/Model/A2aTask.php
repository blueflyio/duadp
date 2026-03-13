<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Model;

use Drupal\Component\Uuid\Php as UuidGenerator;

/**
 * Value object representing an A2A Task.
 */
final class A2aTask implements \JsonSerializable {

  /**
   * The task ID.
   */
  public readonly string $id;

  /**
   * The task status.
   */
  public TaskStatus $status;

  /**
   * Message history.
   *
   * @var \Drupal\bluefly_agent_platform\Model\A2aMessage[]
   */
  public array $history;

  /**
   * Output artifacts.
   *
   * @var \Drupal\bluefly_agent_platform\Model\Artifact[]
   */
  public array $artifacts;

  /**
   * Task metadata.
   */
  public array $metadata;

  /**
   * Constructs an A2aTask.
   *
   * @param string|null $id
   *   Task ID (generated if NULL).
   * @param string|null $contextId
   *   Conversation context ID.
   * @param \Drupal\bluefly_agent_platform\Model\TaskStatus|null $status
   *   Initial status.
   * @param array $history
   *   Message history.
   * @param array $artifacts
   *   Output artifacts.
   * @param array $metadata
   *   Task metadata.
   */
  public function __construct(
    ?string $id = NULL,
    public readonly ?string $contextId = NULL,
    ?TaskStatus $status = NULL,
    array $history = [],
    array $artifacts = [],
    array $metadata = [],
  ) {
    $this->id = $id ?? (new UuidGenerator())->generate();
    $this->status = $status ?? new TaskStatus(TaskStatus::STATE_SUBMITTED);
    $this->history = $history;
    $this->artifacts = $artifacts;
    $this->metadata = $metadata;
  }

  /**
   * Add a message to history.
   */
  public function addMessage(A2aMessage $message): void {
    $this->history[] = $message;
  }

  /**
   * Add an artifact.
   */
  public function addArtifact(Artifact $artifact): void {
    $this->artifacts[] = $artifact;
  }

  /**
   * Transition to a new state.
   *
   * @param string $state
   *   New task state.
   * @param string|null $message
   *   Status message.
   *
   * @throws \LogicException
   *   If current state is terminal.
   */
  public function transitionTo(string $state, ?string $message = NULL): void {
    if ($this->status->isTerminal()) {
      throw new \LogicException(
        "Cannot transition from terminal state '{$this->status->state}' to '$state'."
      );
    }

    $this->status = new TaskStatus(
      state: $state,
      message: $message,
      timestamp: (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
    );
  }

  /**
   * {@inheritdoc}
   */
  public function jsonSerialize(): array {
    $data = [
      'id' => $this->id,
      'status' => $this->status->jsonSerialize(),
    ];

    if ($this->contextId !== NULL) {
      $data['contextId'] = $this->contextId;
    }
    if (!empty($this->history)) {
      $data['history'] = array_map(
        fn(A2aMessage $m) => $m->jsonSerialize(),
        $this->history,
      );
    }
    if (!empty($this->artifacts)) {
      $data['artifacts'] = array_map(
        fn(Artifact $a) => $a->jsonSerialize(),
        $this->artifacts,
      );
    }
    if (!empty($this->metadata)) {
      $data['metadata'] = $this->metadata;
    }

    return $data;
  }

  /**
   * Create from a database row.
   */
  public static function fromRow(object $row): self {
    $history = [];
    if (!empty($row->history)) {
      $decoded = json_decode($row->history, TRUE) ?? [];
      $history = array_map(
        fn(array $m) => A2aMessage::fromArray($m),
        $decoded,
      );
    }

    $artifacts = [];
    if (!empty($row->artifacts)) {
      $decoded = json_decode($row->artifacts, TRUE) ?? [];
      $artifacts = array_map(
        fn(array $a) => Artifact::fromArray($a),
        $decoded,
      );
    }

    $metadata = [];
    if (!empty($row->metadata)) {
      $metadata = json_decode($row->metadata, TRUE) ?? [];
    }

    $timestamp = (new \DateTimeImmutable())
      ->setTimestamp((int) $row->updated)
      ->format(\DateTimeInterface::ATOM);

    return new self(
      id: $row->id,
      contextId: $row->context_id ?: NULL,
      status: new TaskStatus(
        state: $row->state,
        message: $row->status_message,
        timestamp: $timestamp,
      ),
      history: $history,
      artifacts: $artifacts,
      metadata: $metadata,
    );
  }

}
