<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Exception;

/**
 * Exception thrown when communication with a fleet site fails.
 *
 * This includes MCP endpoint errors, connection failures to individual
 * fleet sites, and JSON-RPC error responses from fleet site MCP servers.
 */
class FleetCommunicationException extends \RuntimeException {

}
