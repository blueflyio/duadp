<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service\Protocol;

/**
 * Protocol adapter registry.
 *
 * Manages all protocol adapters and selects the appropriate one for agents.
 * Implements OSSA v0.3.2 multi-protocol agent communication.
 */
class ProtocolRegistry {

  /**
   * Registered adapters.
   *
   * @var \Drupal\bluefly_agent_platform\Service\Protocol\ProtocolAdapterInterface[]
   */
  protected array $adapters = [];

  /**
   * Register a protocol adapter.
   *
   * @param \Drupal\bluefly_agent_platform\Service\Protocol\ProtocolAdapterInterface $adapter
   *   Protocol adapter.
   */
  public function register(ProtocolAdapterInterface $adapter): void {
    $this->adapters[$adapter->getProtocolName()] = $adapter;
  }

  /**
   * Get adapter for agent manifest.
   *
   * @param array $manifest
   *   Agent manifest.
   *
   * @return \Drupal\bluefly_agent_platform\Service\Protocol\ProtocolAdapterInterface|null
   *   Adapter or NULL if none can handle.
   */
  public function getAdapter(array $manifest): ?ProtocolAdapterInterface {
    // Try each adapter to see if it can handle this manifest.
    foreach ($this->adapters as $adapter) {
      if ($adapter->canHandle($manifest)) {
        return $adapter;
      }
    }

    return NULL;
  }

  /**
   * Get adapter by protocol name.
   *
   * @param string $protocol
   *   Protocol name.
   *
   * @return \Drupal\bluefly_agent_platform\Service\Protocol\ProtocolAdapterInterface|null
   *   Adapter or NULL if not found.
   */
  public function getAdapterByName(string $protocol): ?ProtocolAdapterInterface {
    return $this->adapters[$protocol] ?? NULL;
  }

  /**
   * Get all registered adapters.
   *
   * @return \Drupal\bluefly_agent_platform\Service\Protocol\ProtocolAdapterInterface[]
   *   All adapters.
   */
  public function getAllAdapters(): array {
    return array_values($this->adapters);
  }

  /**
   * Discover agents from all protocols.
   *
   * @param array $config
   *   Protocol-specific configuration.
   *
   * @return array
   *   Array of discovered agents.
   */
  public function discoverAllAgents(array $config = []): array {
    $agents = [];

    foreach ($this->adapters as $adapter) {
      try {
        $discovered = $adapter->discoverAgents($config[$adapter->getProtocolName()] ?? []);
        foreach ($discovered as $agent) {
          $agent['protocol'] = $adapter->getProtocolName();
          $agents[] = $agent;
        }
      }
      catch (\Exception $e) {
        // Log but continue with other adapters.
        continue;
      }
    }

    return $agents;
  }

}
