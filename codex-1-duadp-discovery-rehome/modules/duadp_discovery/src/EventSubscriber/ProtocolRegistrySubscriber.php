<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\EventSubscriber;

use Drupal\bluefly_agent_platform\Service\Protocol\ProtocolRegistryInitializer;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Ensures protocol adapters (HTTP, MCP, Duo) are registered on each request.
 */
class ProtocolRegistrySubscriber implements EventSubscriberInterface {

  public function __construct(
    protected ProtocolRegistryInitializer $initializer,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function getSubscribedEvents(): array {
    return [
      KernelEvents::REQUEST => ['onRequest', 100],
    ];
  }

  public function onRequest(RequestEvent $event): void {
    $this->initializer->initialize();
  }

}
