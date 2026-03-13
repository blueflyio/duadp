<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service\Protocol;

/**
 * Registers default protocol adapters (HTTP, MCP, Duo) with the registry.
 *
 * Called once per request so the ProtocolRegistry is ready for task dispatch
 * and agent discovery.
 */
class ProtocolRegistryInitializer {

  protected bool $initialized = FALSE;

  public function __construct(
    protected ProtocolRegistry $registry,
    protected ProtocolAdapterInterface $httpAdapter,
    protected ProtocolAdapterInterface $mcpAdapter,
    protected ProtocolAdapterInterface $duoAdapter,
  ) {}

  /**
   * Registers adapters with the registry (idempotent).
   */
  public function initialize(): void {
    if ($this->initialized) {
      return;
    }
    $this->registry->register($this->httpAdapter);
    $this->registry->register($this->mcpAdapter);
    $this->registry->register($this->duoAdapter);
    $this->initialized = TRUE;
  }

}
