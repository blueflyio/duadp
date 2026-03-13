<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Model\Part;

/**
 * Value object for a file message part.
 */
final class FilePart implements PartInterface {

  /**
   * Constructs a FilePart.
   *
   * @param array $file
   *   File data with keys: name, mimeType, bytes (base64), uri.
   */
  public function __construct(
    public readonly array $file,
  ) {}

  /**
   * {@inheritdoc}
   */
  public function getType(): string {
    return 'file';
  }

  /**
   * {@inheritdoc}
   */
  public function jsonSerialize(): array {
    return [
      'kind' => 'file',
      'file' => $this->file,
    ];
  }

}
