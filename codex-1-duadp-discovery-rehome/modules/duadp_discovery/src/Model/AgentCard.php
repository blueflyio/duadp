<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Model;

/**
 * Value object representing an A2A Agent Card.
 */
final class AgentCard implements \JsonSerializable {

  /**
   * Constructs an AgentCard.
   *
   * @param string $name
   *   Human-readable agent name.
   * @param string $url
   *   Base URL of the A2A endpoint.
   * @param string $version
   *   A2A protocol version supported.
   * @param \Drupal\bluefly_agent_platform\Model\Skill[] $skills
   *   Agent skills.
   * @param string $description
   *   Agent description.
   * @param array $defaultInputModes
   *   Supported input modes.
   * @param array $defaultOutputModes
   *   Supported output modes.
   * @param array|null $provider
   *   Provider info (organization, url).
   * @param array|null $capabilities
   *   Agent capabilities.
   * @param array|null $authentication
   *   Authentication info.
   */
  public function __construct(
    public readonly string $name,
    public readonly string $url,
    public readonly string $version = '1.0',
    public readonly array $skills = [],
    public readonly string $description = '',
    public readonly array $defaultInputModes = ['text'],
    public readonly array $defaultOutputModes = ['text'],
    public readonly ?array $provider = NULL,
    public readonly ?array $capabilities = NULL,
    public readonly ?array $authentication = NULL,
  ) {}

  /**
   * {@inheritdoc}
   */
  public function jsonSerialize(): array {
    $data = [
      'name' => $this->name,
      'url' => $this->url,
      'version' => $this->version,
      'skills' => array_map(fn(Skill $s) => $s->jsonSerialize(), $this->skills),
      'defaultInputModes' => $this->defaultInputModes,
      'defaultOutputModes' => $this->defaultOutputModes,
    ];

    if ($this->description !== '') {
      $data['description'] = $this->description;
    }
    if ($this->provider !== NULL) {
      $data['provider'] = $this->provider;
    }
    if ($this->capabilities !== NULL) {
      $data['capabilities'] = $this->capabilities;
    }
    if ($this->authentication !== NULL) {
      $data['authentication'] = $this->authentication;
    }

    return $data;
  }

}
