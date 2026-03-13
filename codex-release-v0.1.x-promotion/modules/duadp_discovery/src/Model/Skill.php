<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Model;

/**
 * Value object representing an A2A Agent Skill.
 */
final class Skill implements \JsonSerializable {

  /**
   * Constructs a Skill.
   *
   * @param string $id
   *   Skill identifier.
   * @param string $name
   *   Human-readable skill name.
   * @param string $description
   *   Skill description.
   * @param string[] $tags
   *   Categorization tags.
   * @param string[] $examples
   *   Example prompts.
   */
  public function __construct(
    public readonly string $id,
    public readonly string $name,
    public readonly string $description,
    public readonly array $tags = [],
    public readonly array $examples = [],
  ) {}

  /**
   * {@inheritdoc}
   */
  public function jsonSerialize(): array {
    $data = [
      'id' => $this->id,
      'name' => $this->name,
      'description' => $this->description,
    ];

    if (!empty($this->tags)) {
      $data['tags'] = $this->tags;
    }
    if (!empty($this->examples)) {
      $data['examples'] = $this->examples;
    }

    return $data;
  }

}
