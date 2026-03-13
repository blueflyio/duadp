<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

/**
 * Resolves the current Drupal core version for DI use.
 *
 * Single place for \Drupal::VERSION so other classes avoid static calls.
 */
final class CoreVersionResolver {

  /**
   * Returns the current Drupal core version string.
   *
   * @return string
   *   e.g. "11.3.3"
   */
  public function getVersion(): string {
    return \Drupal::VERSION;
  }

}
