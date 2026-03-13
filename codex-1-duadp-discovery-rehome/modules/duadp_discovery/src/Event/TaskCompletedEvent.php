<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Event;

use Drupal\bluefly_agent_platform\Model\A2aTask;
use Drupal\Component\EventDispatcher\Event;

/**
 * Event dispatched when an A2A task completes successfully.
 */
class TaskCompletedEvent extends Event {

  public function __construct(
    public readonly A2aTask $task,
  ) {}

}
