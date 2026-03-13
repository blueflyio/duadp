<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Event;

/**
 * Defines A2A protocol event constants.
 *
 * These events can be consumed by ECA module for workflow automation.
 */
final class A2aEvents {

  /**
   * Dispatched when a new A2A task is created.
   */
  public const TASK_CREATED = 'ai_agents_communication.task.created';

  /**
   * Dispatched when an A2A task completes successfully.
   */
  public const TASK_COMPLETED = 'ai_agents_communication.task.completed';

  /**
   * Dispatched when an A2A task fails.
   */
  public const TASK_FAILED = 'ai_agents_communication.task.failed';

  /**
   * Dispatched when an inbound A2A message is received.
   */
  public const MESSAGE_RECEIVED = 'ai_agents_communication.message.received';

}
