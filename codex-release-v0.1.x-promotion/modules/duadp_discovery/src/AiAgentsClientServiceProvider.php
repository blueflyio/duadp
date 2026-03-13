<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform;

use Drupal\Core\DependencyInjection\ContainerBuilder;
use Drupal\Core\DependencyInjection\ServiceProviderBase;
use Symfony\Component\DependencyInjection\Reference;

/**
 * Conditionally wires optional dependencies for ai_agents_client services.
 */
class AiAgentsClientServiceProvider extends ServiceProviderBase {

  /**
   * {@inheritdoc}
   */
  public function alter(ContainerBuilder $container): void {
    // Inject OSSA permission resolver when ai_agents_ossa is installed.
    if ($container->has('ai_agents_ossa.permission_resolver')) {
      $definition = $container->getDefinition('ai_agents_client.policy');
      $definition->addMethodCall('setPermissionResolver', [
        new Reference('ai_agents_ossa.permission_resolver'),
      ]);
    }
  }

}
