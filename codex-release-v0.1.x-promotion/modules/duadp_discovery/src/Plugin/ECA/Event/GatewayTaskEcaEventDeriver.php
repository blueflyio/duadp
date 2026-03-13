<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\ECA\Event;

use Drupal\eca\Plugin\ECA\Event\EventDeriverBase;

/**
 * Deriver for gateway task ECA event plugins.
 */
class GatewayTaskEcaEventDeriver extends EventDeriverBase {

  /**
   * {@inheritdoc}
   */
  protected function definitions(): array {
    return GatewayTaskEcaEvent::definitions();
  }

}
