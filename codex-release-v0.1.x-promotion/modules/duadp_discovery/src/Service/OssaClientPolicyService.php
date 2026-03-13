<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Extension\ModuleHandlerInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\Core\Logger\LoggerChannelInterface;

/**
 * Service for authorizing agent actions via centralized Cedar policies.
 *
 * Delegates to OssaPermissionResolver when the ai_agents_ossa module is
 * installed. Falls back to a permissive default when it is not available.
 */
class OssaClientPolicyService {

  /**
   * The logger service.
   *
   * @var \Drupal\Core\Logger\LoggerChannelInterface
   */
  protected LoggerChannelInterface $logger;

  /**
   * The optional OSSA permission resolver (set via ServiceProvider).
   *
   * @var object|null
   */
  protected ?object $permissionResolver = NULL;

  /**
   * Constructs an OssaClientPolicyService object.
   *
   * @param \Drupal\Core\Config\ConfigFactoryInterface $configFactory
   *   The config factory service.
   * @param \Drupal\Core\Logger\LoggerChannelFactoryInterface $loggerFactory
   *   The logger channel factory.
   * @param \Drupal\Core\Extension\ModuleHandlerInterface $moduleHandler
   *   The module handler service.
   */
  public function __construct(
    protected ConfigFactoryInterface $configFactory,
    LoggerChannelFactoryInterface $loggerFactory,
    protected ModuleHandlerInterface $moduleHandler,
  ) {
    $this->logger = $loggerFactory->get('ai_agents_client');
  }

  /**
   * Sets the optional OSSA permission resolver.
   *
   * Called by AiAgentsClientServiceProvider when ai_agents_ossa is installed.
   *
   * @param object $resolver
   *   The OSSA permission resolver service.
   */
  public function setPermissionResolver(object $resolver): void {
    $this->permissionResolver = $resolver;
  }

  /**
   * Authorize an action for a specific agent.
   *
   * When ai_agents_ossa is installed this delegates to the OSSA permission
   * resolver. Otherwise it logs the attempt and returns TRUE (permissive
   * fallback) so the module can operate standalone.
   *
   * @param string $agent_id
   *   The agent ID.
   * @param string $operation
   *   The operation to authorize.
   * @param array $context
   *   Additional context for authorization.
   *
   * @return bool
   *   TRUE if authorized, FALSE otherwise.
   */
  public function authorizeAction(string $agent_id, string $operation, array $context = []): bool {
    $config = $this->configFactory->get('ai_agents_client.settings');
    $client_id = $config->get('client_id') ?? 'unknown';

    $this->logger->info('OSSA Policy Check: Agent @id attempting @op on site @site', [
      '@id' => $agent_id,
      '@op' => $operation,
      '@site' => $client_id,
    ]);

    // Delegate to ai_agents_ossa when the resolver is injected.
    if ($this->permissionResolver !== NULL) {
      try {
        return $this->permissionResolver->isAllowed($agent_id, $operation, $context);
      }
      catch (\Exception $e) {
        $this->logger->error('OSSA permission resolver error: @message', [
          '@message' => $e->getMessage(),
        ]);
        return FALSE;
      }
    }

    // Permissive fallback when ai_agents_ossa is not installed.
    $this->logger->notice('OSSA module not installed; allowing action @op for agent @id by default.', [
      '@op' => $operation,
      '@id' => $agent_id,
    ]);

    return TRUE;
  }

}
