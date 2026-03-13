<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Model;

use Drupal\bluefly_agent_platform\Model\Part\DataPart;
use Drupal\bluefly_agent_platform\Model\Part\FilePart;
use Drupal\bluefly_agent_platform\Model\Part\PartInterface;
use Drupal\bluefly_agent_platform\Model\Part\TextPart;
use Drupal\Component\Uuid\Php as UuidGenerator;

/**
 * Value object representing an A2A Artifact.
 */
final class Artifact implements \JsonSerializable {

  /**
   * The artifact ID.
   */
  public readonly string $artifactId;

  /**
   * Constructs an Artifact.
   *
   * @param \Drupal\bluefly_agent_platform\Model\Part\PartInterface[] $parts
   *   Artifact parts.
   * @param string|null $artifactId
   *   Unique artifact identifier (generated if NULL).
   * @param string|null $name
   *   Artifact name.
   * @param string|null $description
   *   Artifact description.
   * @param int|null $index
   *   Ordering index.
   * @param bool $append
   *   Whether to append to existing.
   * @param bool $lastChunk
   *   Whether this is the last chunk.
   * @param array $metadata
   *   Additional metadata.
   */
  public function __construct(
    public readonly array $parts,
    ?string $artifactId = NULL,
    public readonly ?string $name = NULL,
    public readonly ?string $description = NULL,
    public readonly ?int $index = NULL,
    public readonly bool $append = FALSE,
    public readonly bool $lastChunk = TRUE,
    public readonly array $metadata = [],
  ) {
    $this->artifactId = $artifactId ?? (new UuidGenerator())->generate();
  }

  /**
   * Create from an array (e.g., from JSON decode).
   */
  public static function fromArray(array $data): self {
    $parts = [];
    foreach ($data['parts'] ?? [] as $part) {
      $parts[] = match ($part['kind'] ?? '') {
        'text' => new TextPart($part['text'] ?? ''),
        'file' => new FilePart($part['file'] ?? []),
        'data' => new DataPart($part['data'] ?? []),
        default => new TextPart(json_encode($part)),
      };
    }

    return new self(
      parts: $parts,
      artifactId: $data['artifactId'] ?? NULL,
      name: $data['name'] ?? NULL,
      description: $data['description'] ?? NULL,
      index: $data['index'] ?? NULL,
      append: $data['append'] ?? FALSE,
      lastChunk: $data['lastChunk'] ?? TRUE,
      metadata: $data['metadata'] ?? [],
    );
  }

  /**
   * {@inheritdoc}
   */
  public function jsonSerialize(): array {
    $data = [
      'artifactId' => $this->artifactId,
      'parts' => array_map(
        fn(PartInterface $p) => $p->jsonSerialize(),
        $this->parts,
      ),
    ];

    if ($this->name !== NULL) {
      $data['name'] = $this->name;
    }
    if ($this->description !== NULL) {
      $data['description'] = $this->description;
    }
    if ($this->index !== NULL) {
      $data['index'] = $this->index;
    }
    if ($this->append) {
      $data['append'] = TRUE;
    }
    if (!$this->lastChunk) {
      $data['lastChunk'] = FALSE;
    }
    if (!empty($this->metadata)) {
      $data['metadata'] = $this->metadata;
    }

    return $data;
  }

}
