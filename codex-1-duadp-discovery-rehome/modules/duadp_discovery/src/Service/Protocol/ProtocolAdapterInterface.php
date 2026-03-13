<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service\Protocol;

/**
 * Protocol adapter interface.
 *
 * All protocol adapters must implement this interface.
 * Supports OSSA v0.3.2 multi-protocol agent communication.
 */
interface ProtocolAdapterInterface {

  /**
   * Get protocol name.
   *
   * @return string
   *   Protocol identifier (e.g., 'mcp', 'a2a', 'openai', 'claude').
   */
  public function getProtocolName(): string;

  /**
   * Check if adapter can handle the agent manifest.
   *
   * @param array $manifest
   *   Agent manifest.
   *
   * @return bool
   *   TRUE if adapter can handle this agent.
   */
  public function canHandle(array $manifest): bool;

  /**
   * Invoke agent capability.
   *
   * @param array $manifest
   *   Agent manifest.
   * @param string $capability
   *   Capability name.
   * @param array $input
   *   Input parameters.
   * @param int $timeout
   *   Timeout in seconds.
   *
   * @return array
   *   Execution result with 'success', 'result', 'error', 'execution_time', 'tokens_used'.
   */
  public function invoke(
    array $manifest,
    string $capability,
    array $input,
    int $timeout
  ): array;

  /**
   * Discover agents via this protocol.
   *
   * @param array $config
   *   Protocol-specific configuration.
   *
   * @return array
   *   Array of discovered agents with manifests.
   */
  public function discoverAgents(array $config = []): array;

  /**
   * Check agent health.
   *
   * @param array $manifest
   *   Agent manifest.
   *
   * @return array
   *   Health status with 'status', 'response_time', 'error'.
   */
  public function checkHealth(array $manifest): array;

}
