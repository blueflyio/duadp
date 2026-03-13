<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Event;

use Drupal\bluefly_agent_platform\Model\A2aMessage;
use Drupal\Component\EventDispatcher\Event;

/**
 * Event dispatched when an inbound A2A message is received.
 */
class MessageReceivedEvent extends Event {

  public function __construct(
    public readonly A2aMessage $message,
  ) {}

}
