<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

use Drupal\Core\Config\ConfigFactoryInterface;
use Psr\Log\LoggerInterface;

/**
 * Resolves platform endpoint URLs using a 3-tier strategy.
 *
 * Resolution priority (highest to lowest):
 *   1. Environment variable (e.g. A2A_URL)
 *   2. Drupal configuration (ai_agents_communication.settings)
 *   3. Hardcoded default
 *
 * This follows the same pattern used across all wired Agent Platform
 * Drupal modules so that platform infrastructure endpoints are resolved
 * consistently whether running on Oracle, NAS, or local dev.
 */
class PlatformEndpointResolver {

  /**
   * Default platform endpoint URLs.
   *
   * Empty for public contrib: no provider is assumed. Sites configure URLs
   * via the admin form (Configuration > AI > Agents Communication) or
   * environment variables. Optional config presets (e.g. network.blueflyagents)
   * can provide example values.
   */
  protected const DEFAULTS = [
    'a2a_collector_url' => '',
    'a2a_stream_url' => '',
    'mesh_url' => '',
    'mcp_url' => '',
  ];

  /**
   * Mapping of config keys to environment variable names.
   */
  protected const ENV_MAP = [
    'a2a_collector_url' => 'A2A_URL',
    'a2a_stream_url' => 'A2A_STREAM_URL',
    'mesh_url' => 'AGENT_MESH_URL',
    'mcp_url' => 'MCP_URL',
  ];

  /**
   * Constructs a PlatformEndpointResolver.
   *
   * @param \Drupal\Core\Config\ConfigFactoryInterface $configFactory
   *   The config factory.
   * @param \Psr\Log\LoggerInterface $logger
   *   The logger channel.
   */
  public function __construct(
    protected readonly ConfigFactoryInterface $configFactory,
    protected readonly LoggerInterface $logger,
  ) {}

  /**
   * Resolves a platform endpoint URL via the 3-tier strategy.
   *
   * @param string $key
   *   The config key (e.g. 'a2a_collector_url', 'mesh_url').
   *
   * @return string
   *   The resolved URL.
   */
  public function resolve(string $key): string {
    // Tier 1: Environment variable.
    $envVar = self::ENV_MAP[$key] ?? '';
    if ($envVar !== '') {
      $envValue = getenv($envVar);
      if ($envValue !== FALSE && $envValue !== '') {
        $this->logger->debug('Platform endpoint @key resolved from env @var', [
          '@key' => $key,
          '@var' => $envVar,
        ]);
        return $envValue;
      }
    }

    // Tier 2: Drupal configuration.
    $config = $this->configFactory->get('ai_agents_communication.settings');
    $configValue = $config->get('platform.' . $key);
    if (!empty($configValue)) {
      return $configValue;
    }

    // Tier 3: Hardcoded default.
    return self::DEFAULTS[$key] ?? '';
  }

  /**
   * Resolves the A2A collector URL.
   *
   * @return string
   *   The A2A collector URL.
   */
  public function getA2aCollectorUrl(): string {
    return $this->resolve('a2a_collector_url');
  }

  /**
   * Resolves the A2A stream URL.
   *
   * @return string
   *   The A2A stream URL.
   */
  public function getA2aStreamUrl(): string {
    return $this->resolve('a2a_stream_url');
  }

  /**
   * Resolves the Agent Mesh URL.
   *
   * @return string
   *   The mesh URL.
   */
  public function getMeshUrl(): string {
    return $this->resolve('mesh_url');
  }

  /**
   * Resolves the MCP URL.
   *
   * @return string
   *   The MCP URL.
   */
  public function getMcpUrl(): string {
    return $this->resolve('mcp_url');
  }

  /**
   * Returns the connection timeout in seconds from config.
   *
   * @return int
   *   Timeout in seconds.
   */
  public function getConnectionTimeout(): int {
    $config = $this->configFactory->get('ai_agents_communication.settings');
    return (int) ($config->get('platform.connection_timeout') ?: 30);
  }

  /**
   * Returns the maximum number of retries from config.
   *
   * @return int
   *   Maximum retry count.
   */
  public function getMaxRetries(): int {
    $config = $this->configFactory->get('ai_agents_communication.settings');
    return (int) ($config->get('platform.max_retries') ?: 3);
  }

  /**
   * Returns the retry delay in milliseconds from config.
   *
   * @return int
   *   Retry delay in milliseconds.
   */
  public function getRetryDelay(): int {
    $config = $this->configFactory->get('ai_agents_communication.settings');
    return (int) ($config->get('platform.retry_delay') ?: 1000);
  }

  /**
   * Returns all resolved platform endpoints and connection settings.
   *
   * Useful for status pages, diagnostics, and health checks.
   *
   * @return array
   *   Associative array of all resolved endpoint URLs and settings.
   */
  public function getAllResolved(): array {
    $resolved = [];
    foreach (array_keys(self::DEFAULTS) as $key) {
      $resolved[$key] = [
        'url' => $this->resolve($key),
        'source' => $this->getResolutionSource($key),
        'env_var' => self::ENV_MAP[$key] ?? '',
      ];
    }
    $resolved['connection_timeout'] = $this->getConnectionTimeout();
    $resolved['max_retries'] = $this->getMaxRetries();
    $resolved['retry_delay'] = $this->getRetryDelay();
    return $resolved;
  }

  /**
   * Determines which tier resolved the value for a given key.
   *
   * @param string $key
   *   The config key.
   *
   * @return string
   *   One of 'env', 'config', or 'default'.
   */
  public function getResolutionSource(string $key): string {
    $envVar = self::ENV_MAP[$key] ?? '';
    if ($envVar !== '') {
      $envValue = getenv($envVar);
      if ($envValue !== FALSE && $envValue !== '') {
        return 'env';
      }
    }

    $config = $this->configFactory->get('ai_agents_communication.settings');
    $configValue = $config->get('platform.' . $key);
    if (!empty($configValue)) {
      return 'config';
    }

    return 'default';
  }

  /**
   * Returns the default URLs for reference.
   *
   * @return array
   *   Default URL map.
   */
  public static function getDefaults(): array {
    return self::DEFAULTS;
  }

  /**
   * Returns the env var map for reference.
   *
   * @return array
   *   Config key to env var map.
   */
  public static function getEnvMap(): array {
    return self::ENV_MAP;
  }

}
