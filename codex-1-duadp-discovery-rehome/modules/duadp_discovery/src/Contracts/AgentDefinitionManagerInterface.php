<?php

namespace Drupal\bluefly_agent_platform\Contracts;

interface AgentDefinitionManagerInterface {
  /**
   * Resolves an agent definition by ID or machine name.
   */
  public function getDefinition(string $agentId): ?object;
  
  /**
   * Returns a list of available agents matching criteria.
   */
  public function listDefinitions(array $criteria = []): array;
}
