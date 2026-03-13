<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Entity;

use Drupal\Core\Config\Entity\ConfigEntityInterface;

/**
 * Interface for Agent Definition config entities.
 */
interface AgentDefinitionInterface extends ConfigEntityInterface {

  /**
   * Gets the agent description.
   */
  public function getDescription(): string;

  /**
   * Gets the OSSA manifest as an array.
   *
   * @return array<string, mixed>
   *   The OSSA manifest data.
   */
  public function getOssaManifest(): array;

  /**
   * Gets the OSSA spec version.
   */
  public function getOssaVersion(): string;

  /**
   * Gets the Drupal AI Agent config entity reference.
   */
  public function getDrupalConfigEntity(): ?string;

  /**
   * Gets the approval policy ID.
   */
  public function getApprovalPolicy(): ?string;

  /**
   * Gets the provider profile ID.
   */
  public function getProviderProfile(): ?string;

  /**
   * Gets capability grant labels.
   *
   * @return string[]
   *   The capability labels.
   */
  public function getCapabilities(): array;

}
