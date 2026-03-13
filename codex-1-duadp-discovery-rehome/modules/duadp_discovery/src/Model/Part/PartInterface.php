<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Model\Part;

/**
 * Interface for A2A message parts.
 */
interface PartInterface extends \JsonSerializable {

  /**
   * Get the part type identifier.
   */
  public function getType(): string;

}
