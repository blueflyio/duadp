<?php

namespace Drupal\bluefly_agent_platform\Contracts;

interface ToolCapabilityRegistryInterface {
  /**
   * Retrieves tool descriptors dynamically.
   */
  public function getTool(string $toolId): ?object;
  
  /**
   * Returns tools matching specific capability tags or contexts.
   */
  public function listAvailableTools(array $context = []): array;
}
