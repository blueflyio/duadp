<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Event;

/**
 * Defines events for gateway task operations.
 */
final class GatewayTaskEvents {

  /**
   * Fired when a task is dispatched to the gateway.
   *
   * @Event
   *
   * @see \Drupal\bluefly_agent_platform\Event\GatewayTaskEvent
   */
  public const TASK_DISPATCHED = 'ai_agents_client.task.dispatched';

  /**
   * Fired when a gateway task completes successfully.
   *
   * @Event
   *
   * @see \Drupal\bluefly_agent_platform\Event\GatewayTaskEvent
   */
  public const TASK_COMPLETED = 'ai_agents_client.task.completed';

  /**
   * Fired when a gateway task fails.
   *
   * @Event
   *
   * @see \Drupal\bluefly_agent_platform\Event\GatewayTaskEvent
   */
  public const TASK_FAILED = 'ai_agents_client.task.failed';

  /**
   * Fired when a task is queued for processing.
   *
   * @Event
   *
   * @see \Drupal\bluefly_agent_platform\Event\GatewayTaskEvent
   */
  public const TASK_QUEUED = 'ai_agents_client.task.queued';

  /**
   * Fired when a task authorization check occurs.
   *
   * @Event
   *
   * @see \Drupal\bluefly_agent_platform\Event\GatewayTaskEvent
   */
  public const TASK_AUTHORIZED = 'ai_agents_client.task.authorized';

}
