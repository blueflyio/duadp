<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\EventSubscriber;

use Drupal\Core\Config\ConfigEvents;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\bluefly_agent_platform\Service\PlatformEndpointResolver;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

/**
 * Syncs A2A collector base_uri into http_client_manager when settings are saved.
 *
 * Ensures the a2a_collector API client uses the resolved collector URL
 * (env > config > default) for POST /a2a/log.
 */
class A2aCollectorConfigSubscriber implements EventSubscriberInterface {

  public function __construct(
    protected ConfigFactoryInterface $configFactory,
    protected PlatformEndpointResolver $endpointResolver,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function getSubscribedEvents(): array {
    return [
      ConfigEvents::SAVE => ['onConfigSave', 100],
      ConfigEvents::IMPORT => ['onConfigSave', 100],
    ];
  }

  /**
   * When ai_agents_communication.settings is saved, sync collector base_uri to http_client_manager.
   */
  public function onConfigSave($event): void {
    if ($event->getConfig()->getName() !== 'ai_agents_communication.settings') {
      return;
    }

    $collectorUrl = rtrim($this->endpointResolver->getA2aCollectorUrl(), '/');
    if ($collectorUrl === '') {
      return;
    }

    $base_uri = $collectorUrl . '/';

    $hcm = $this->configFactory->getEditable('http_client_manager.settings');
    $overrides = $hcm->get('overrides') ?? [];
    if (!is_array($overrides)) {
      $overrides = [];
    }
    $overrides['a2a_collector'] = array_merge(
      $overrides['a2a_collector'] ?? [],
      ['config' => ['base_uri' => $base_uri]],
    );
    $hcm->set('overrides', $overrides);
    $hcm->set('enable_overriding_service_definitions', 1);
    $hcm->save();
  }

}
