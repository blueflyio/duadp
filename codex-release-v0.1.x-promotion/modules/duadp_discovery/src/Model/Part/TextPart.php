<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Model\Part;

/**
 * Value object for a text message part.
 */
final class TextPart implements PartInterface {

  /**
   * Constructs a TextPart.
   *
   * @param string $text
   *   The text content.
   */
  public function __construct(
    public readonly string $text,
  ) {}

  /**
   * {@inheritdoc}
   */
  public function getType(): string {
    return 'text';
  }

  /**
   * {@inheritdoc}
   */
  public function jsonSerialize(): array {
    return [
      'kind' => 'text',
      'text' => $this->text,
    ];
  }

}
