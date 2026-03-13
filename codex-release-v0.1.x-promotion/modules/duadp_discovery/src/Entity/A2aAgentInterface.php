<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Entity;

use Drupal\Core\Config\Entity\ConfigEntityInterface;

/**
 * Interface for A2A Agent config entities.
 */
interface A2aAgentInterface extends ConfigEntityInterface {

  /**
   * Gets the endpoint URL.
   */
  public function getEndpointUrl(): string;

  /**
   * Sets the endpoint URL.
   */
  public function setEndpointUrl(string $url): static;

  /**
   * Gets the agent type (ossa, mcp, custom).
   */
  public function getAgentType(): string;

  /**
   * Sets the agent type.
   */
  public function setAgentType(string $type): static;

  /**
   * Gets capabilities.
   *
   * @return array
   *   Array of capability names or descriptors.
   */
  public function getCapabilities(): array;

  /**
   * Sets capabilities.
   */
  public function setCapabilities(array $capabilities): static;

  /**
   * Gets the OSSA manifest data.
   */
  public function getOssaManifest(): ?array;

  /**
   * Sets the OSSA manifest data.
   */
  public function setOssaManifest(?array $manifest): static;

  /**
   * Gets the last heartbeat timestamp.
   */
  public function getLastSeen(): int;

  /**
   * Sets the last heartbeat timestamp.
   */
  public function setLastSeen(int $timestamp): static;

  /**
   * Gets the created timestamp.
   */
  public function getCreated(): int;

  /**
   * Sets the created timestamp.
   */
  public function setCreated(int $timestamp): static;

  /**
   * Gets metadata.
   *
   * @return array
   *   Key-value metadata.
   */
  public function getMetadata(): array;

  /**
   * Sets metadata.
   */
  public function setMetadata(array $metadata): static;

}
