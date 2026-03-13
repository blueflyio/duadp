<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Model;

use Drupal\bluefly_agent_platform\Model\Part\DataPart;
use Drupal\bluefly_agent_platform\Model\Part\FilePart;
use Drupal\bluefly_agent_platform\Model\Part\PartInterface;
use Drupal\bluefly_agent_platform\Model\Part\TextPart;

/**
 * Value object representing an A2A Message.
 */
final class A2aMessage implements \JsonSerializable {

  /**
   * Constructs an A2aMessage.
   *
   * @param string $role
   *   Message role: 'user' or 'agent'.
   * @param \Drupal\bluefly_agent_platform\Model\Part\PartInterface[] $parts
   *   Message parts.
   * @param array $metadata
   *   Optional metadata.
   */
  public function __construct(
    public readonly string $role,
    public readonly array $parts,
    public readonly array $metadata = [],
  ) {
    if (!in_array($role, ['user', 'agent'], TRUE)) {
      throw new \InvalidArgumentException("Invalid message role: $role");
    }
  }

  /**
   * Create a simple text message.
   */
  public static function text(string $role, string $text): self {
    return new self(
      role: $role,
      parts: [new TextPart($text)],
    );
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
      role: $data['role'] ?? 'user',
      parts: $parts,
      metadata: $data['metadata'] ?? [],
    );
  }

  /**
   * Get the concatenated text from all TextParts.
   */
  public function getText(): string {
    $texts = [];
    foreach ($this->parts as $part) {
      if ($part instanceof TextPart) {
        $texts[] = $part->text;
      }
    }
    return implode("\n", $texts);
  }

  /**
   * {@inheritdoc}
   */
  public function jsonSerialize(): array {
    $data = [
      'role' => $this->role,
      'parts' => array_map(
        fn(PartInterface $p) => $p->jsonSerialize(),
        $this->parts,
      ),
    ];

    if (!empty($this->metadata)) {
      $data['metadata'] = $this->metadata;
    }

    return $data;
  }

}
