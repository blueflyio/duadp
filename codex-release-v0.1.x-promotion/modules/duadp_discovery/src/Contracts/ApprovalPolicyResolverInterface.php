<?php

namespace Drupal\bluefly_agent_platform\Contracts;

interface ApprovalPolicyResolverInterface {
  /**
   * Determines if a given action requires explicit approval.
   */
  public function resolvePolicy(
    string $toolId,
    string $actionType,
    array $context
  ): object;
}
