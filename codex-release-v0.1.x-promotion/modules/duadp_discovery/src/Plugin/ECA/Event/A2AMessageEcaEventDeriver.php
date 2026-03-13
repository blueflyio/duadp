<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\ECA\Event;

use Drupal\eca\Plugin\ECA\Event\EventDeriverBase;

/**
 * Deriver for A2A communication ECA event plugins.
 *
 * Derives one ECA event plugin variant per event constant defined in
 * A2AMessageEcaEvent::definitions(). Each derived plugin maps to a specific
 * Symfony event dispatched by the ai_agents_communication services.
 */
class A2AMessageEcaEventDeriver extends EventDeriverBase {

  /**
   * {@inheritdoc}
   */
  protected function definitions(): array {
    return A2AMessageEcaEvent::definitions();
  }

}
