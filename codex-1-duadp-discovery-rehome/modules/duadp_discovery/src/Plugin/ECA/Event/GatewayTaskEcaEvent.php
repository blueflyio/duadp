<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\ECA\Event;

use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\eca\Attribute\EcaEvent;
use Drupal\eca\Attribute\Token;
use Drupal\eca\Event\Tag;
use Drupal\eca\Plugin\ECA\Event\EventBase;
use Drupal\bluefly_agent_platform\Event\GatewayTaskEvent;
use Drupal\bluefly_agent_platform\Event\GatewayTaskEvents;
use Symfony\Contracts\EventDispatcher\Event;

/**
 * ECA event plugin for gateway task lifecycle events.
 */
#[EcaEvent(
  id: 'ai_agents_client_gateway_task',
  deriver: GatewayTaskEcaEventDeriver::class,
  label: new TranslatableMarkup('Gateway Task Event'),
  description: new TranslatableMarkup('Reacts to OSSA gateway task lifecycle events (dispatched, completed, failed, queued, authorized).'),
  version_introduced: '1.0.0',
)]
class GatewayTaskEcaEvent extends EventBase {

  /**
   * {@inheritdoc}
   */
  public static function definitions(): array {
    return [
      'task_dispatched' => [
        'label' => 'Gateway task dispatched',
        'event_name' => GatewayTaskEvents::TASK_DISPATCHED,
        'event_class' => GatewayTaskEvent::class,
        'tags' => Tag::RUNTIME | Tag::WRITE | Tag::BEFORE,
      ],
      'task_completed' => [
        'label' => 'Gateway task completed',
        'event_name' => GatewayTaskEvents::TASK_COMPLETED,
        'event_class' => GatewayTaskEvent::class,
        'tags' => Tag::RUNTIME | Tag::AFTER,
      ],
      'task_failed' => [
        'label' => 'Gateway task failed',
        'event_name' => GatewayTaskEvents::TASK_FAILED,
        'event_class' => GatewayTaskEvent::class,
        'tags' => Tag::RUNTIME | Tag::AFTER,
      ],
      'task_queued' => [
        'label' => 'Gateway task queued',
        'event_name' => GatewayTaskEvents::TASK_QUEUED,
        'event_class' => GatewayTaskEvent::class,
        'tags' => Tag::RUNTIME | Tag::WRITE | Tag::BEFORE,
      ],
      'task_authorized' => [
        'label' => 'Gateway task authorized',
        'event_name' => GatewayTaskEvents::TASK_AUTHORIZED,
        'event_class' => GatewayTaskEvent::class,
        'tags' => Tag::RUNTIME | Tag::READ,
      ],
    ];
  }

  /**
   * {@inheritdoc}
   */
  public static function appliesForWildcard(Event $event, string $event_name, string $wildcard): bool {
    if ($wildcard === '*') {
      return TRUE;
    }
    if ($event instanceof GatewayTaskEvent) {
      return $wildcard === $event->getTaskType()
        || $wildcard === $event->getAgentId();
    }
    return FALSE;
  }

  /**
   * {@inheritdoc}
   */
  #[Token(
    name: 'event',
    description: 'The gateway task event.',
    classes: [GatewayTaskEvent::class],
    properties: [
      new Token(name: 'task_id', description: 'The task ID.'),
      new Token(name: 'task_type', description: 'The task type.'),
      new Token(name: 'agent_id', description: 'The agent ID handling the task.'),
      new Token(name: 'gateway', description: 'The gateway endpoint.'),
      new Token(name: 'error_message', description: 'The error message, if any.'),
    ],
  )]
  protected function buildEventData(): array {
    $data = parent::buildEventData();
    $event = $this->event;

    if ($event instanceof GatewayTaskEvent) {
      $data += [
        'task_id' => $event->getTaskId(),
        'task_type' => $event->getTaskType(),
        'agent_id' => $event->getAgentId(),
        'gateway' => $event->getGateway(),
        'error_message' => $event->getErrorMessage() ?? '',
      ];
    }

    return $data;
  }

}
