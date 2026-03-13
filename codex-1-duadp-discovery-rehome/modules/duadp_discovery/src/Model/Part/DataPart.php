<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Model\Part;

/**
 * Value object for a structured data message part.
 */
final class DataPart implements PartInterface {

  /**
   * Constructs a DataPart.
   *
   * @param array $data
   *   Arbitrary structured data.
   */
  public function __construct(
    public readonly array $data,
  ) {}

  /**
   * {@inheritdoc}
   */
  public function getType(): string {
    return 'data';
  }

  /**
   * {@inheritdoc}
   */
  public function jsonSerialize(): array {
    return [
      'kind' => 'data',
      'data' => $this->data,
    ];
  }

}
