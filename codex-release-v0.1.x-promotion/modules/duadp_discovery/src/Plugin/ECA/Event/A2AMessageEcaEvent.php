<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Plugin\ECA\Event;

use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\eca\Attribute\EcaEvent;
use Drupal\eca\Attribute\Token;
use Drupal\eca\Entity\Objects\EcaEvent as EcaEventObject;
use Drupal\eca\Event\Tag;
use Drupal\eca\Plugin\ECA\Event\EventBase;
use Drupal\bluefly_agent_platform\Event\A2AAgentEvent;
use Drupal\bluefly_agent_platform\Event\A2AMessageEvent;
use Drupal\bluefly_agent_platform\Event\A2AMessageEvents;
use Symfony\Contracts\EventDispatcher\Event;

/**
 * ECA Event plugin for A2A communication events.
 *
 * This plugin registers all seven A2A events (message sent, received, failed;
 * agent registered, unregistered; broadcast sent; heartbeat received) with
 * the ECA framework via a deriver. Each derived variant maps to a specific
 * Symfony event dispatched by the ai_agents_communication services.
 */
#[EcaEvent(
  id: 'a2a_communication',
  deriver: A2AMessageEcaEventDeriver::class,
  category: new TranslatableMarkup('AI Agents Communication'),
)]
class A2AMessageEcaEvent extends EventBase {

  /**
   * {@inheritdoc}
   */
  public static function definitions(): array {
    return [
      'message_sent' => [
        'label' => 'A2A: Message sent',
        'description' => 'Fires after a message has been successfully sent to another agent.',
        'event_name' => A2AMessageEvents::MESSAGE_SENT,
        'event_class' => A2AMessageEvent::class,
        'tags' => Tag::RUNTIME | Tag::WRITE | Tag::AFTER,
      ],
      'message_received' => [
        'label' => 'A2A: Message received',
        'description' => 'Fires when an incoming message has been received and processed.',
        'event_name' => A2AMessageEvents::MESSAGE_RECEIVED,
        'event_class' => A2AMessageEvent::class,
        'tags' => Tag::RUNTIME | Tag::READ | Tag::AFTER,
      ],
      'message_failed' => [
        'label' => 'A2A: Message failed',
        'description' => 'Fires when message delivery or processing has failed.',
        'event_name' => A2AMessageEvents::MESSAGE_FAILED,
        'event_class' => A2AMessageEvent::class,
        'tags' => Tag::RUNTIME | Tag::WRITE | Tag::AFTER,
      ],
      'agent_registered' => [
        'label' => 'A2A: Agent registered',
        'description' => 'Fires when a new agent registers in the communication network.',
        'event_name' => A2AMessageEvents::AGENT_REGISTERED,
        'event_class' => A2AAgentEvent::class,
        'tags' => Tag::RUNTIME | Tag::WRITE | Tag::PERSISTENT | Tag::AFTER,
      ],
      'agent_unregistered' => [
        'label' => 'A2A: Agent unregistered',
        'description' => 'Fires when an agent is removed from the communication network.',
        'event_name' => A2AMessageEvents::AGENT_UNREGISTERED,
        'event_class' => A2AAgentEvent::class,
        'tags' => Tag::RUNTIME | Tag::WRITE | Tag::PERSISTENT | Tag::AFTER,
      ],
      'broadcast_sent' => [
        'label' => 'A2A: Broadcast sent',
        'description' => 'Fires after a broadcast message has been dispatched to multiple agents.',
        'event_name' => A2AMessageEvents::BROADCAST_SENT,
        'event_class' => A2AMessageEvent::class,
        'tags' => Tag::RUNTIME | Tag::WRITE | Tag::AFTER,
      ],
      'heartbeat_received' => [
        'label' => 'A2A: Heartbeat received',
        'description' => 'Fires when an agent heartbeat (keep-alive) is received.',
        'event_name' => A2AMessageEvents::HEARTBEAT_RECEIVED,
        'event_class' => A2AAgentEvent::class,
        'tags' => Tag::RUNTIME | Tag::READ | Tag::AFTER,
      ],
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function defaultConfiguration(): array {
    return [
      'agent_filter' => '',
      'message_type_filter' => '',
    ] + parent::defaultConfiguration();
  }

  /**
   * {@inheritdoc}
   */
  public function buildConfigurationForm(array $form, FormStateInterface $form_state): array {
    $eventClass = $this->eventClass();

    if (is_a($eventClass, A2AMessageEvent::class, TRUE)) {
      $form['message_type_filter'] = [
        '#type' => 'textfield',
        '#title' => $this->t('Message type filter'),
        '#default_value' => $this->configuration['message_type_filter'],
        '#description' => $this->t('Optionally restrict this event to a specific message type (e.g., "task", "query", "ping"). Leave empty for all types.'),
      ];
      $form['agent_filter'] = [
        '#type' => 'textfield',
        '#title' => $this->t('Agent ID filter'),
        '#default_value' => $this->configuration['agent_filter'],
        '#description' => $this->t('Optionally restrict this event to messages involving a specific agent ID. Leave empty for all agents.'),
      ];
    }
    elseif (is_a($eventClass, A2AAgentEvent::class, TRUE)) {
      $form['agent_filter'] = [
        '#type' => 'textfield',
        '#title' => $this->t('Agent ID filter'),
        '#default_value' => $this->configuration['agent_filter'],
        '#description' => $this->t('Optionally restrict this event to a specific agent ID. Leave empty for all agents.'),
      ];
    }

    return parent::buildConfigurationForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function submitConfigurationForm(array &$form, FormStateInterface $form_state): void {
    $this->configuration['agent_filter'] = $form_state->getValue('agent_filter', '');
    $this->configuration['message_type_filter'] = $form_state->getValue('message_type_filter', '');
    parent::submitConfigurationForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function generateWildcard(string $eca_config_id, EcaEventObject $ecaEvent): string {
    $configuration = $ecaEvent->getConfiguration();
    $parts = [];

    $agent_filter = trim($configuration['agent_filter'] ?? '');
    if ($agent_filter !== '') {
      $parts[] = 'agent:' . $agent_filter;
    }

    $type_filter = trim($configuration['message_type_filter'] ?? '');
    if ($type_filter !== '') {
      $parts[] = 'type:' . $type_filter;
    }

    return empty($parts) ? '*' : implode('|', $parts);
  }

  /**
   * {@inheritdoc}
   */
  public static function appliesForWildcard(Event $event, string $event_name, string $wildcard): bool {
    if ($wildcard === '*') {
      return TRUE;
    }

    $filters = [];
    foreach (explode('|', $wildcard) as $part) {
      [$key, $value] = explode(':', $part, 2) + [1 => ''];
      $filters[$key] = $value;
    }

    if ($event instanceof A2AMessageEvent) {
      if (isset($filters['agent'])) {
        $agent = $filters['agent'];
        if ($event->getFromAgent() !== $agent && $event->getToAgent() !== $agent) {
          return FALSE;
        }
      }
      if (isset($filters['type']) && $event->getMessageType() !== $filters['type']) {
        return FALSE;
      }
    }
    elseif ($event instanceof A2AAgentEvent) {
      if (isset($filters['agent']) && $event->getAgentId() !== $filters['agent']) {
        return FALSE;
      }
    }

    return TRUE;
  }

  /**
   * {@inheritdoc}
   */
  #[Token(
    name: 'event',
    description: 'The A2A communication event.',
    classes: [A2AMessageEvent::class, A2AAgentEvent::class],
    properties: [
      new Token(
        name: 'message_id',
        description: 'The unique message identifier.',
        classes: [A2AMessageEvent::class],
      ),
      new Token(
        name: 'from_agent',
        description: 'The sending agent ID.',
        classes: [A2AMessageEvent::class],
      ),
      new Token(
        name: 'to_agent',
        description: 'The receiving agent ID.',
        classes: [A2AMessageEvent::class],
      ),
      new Token(
        name: 'message_type',
        description: 'The message type (task, query, ping, etc.).',
        classes: [A2AMessageEvent::class],
      ),
      new Token(
        name: 'status',
        description: 'The delivery/processing status.',
        classes: [A2AMessageEvent::class],
      ),
      new Token(
        name: 'error',
        description: 'The error message, if delivery failed.',
        classes: [A2AMessageEvent::class],
      ),
      new Token(
        name: 'payload',
        description: 'The message payload as JSON string.',
        classes: [A2AMessageEvent::class],
      ),
      new Token(
        name: 'response',
        description: 'The response data as JSON string.',
        classes: [A2AMessageEvent::class],
      ),
      new Token(
        name: 'agent_id',
        description: 'The agent identifier.',
        classes: [A2AAgentEvent::class],
      ),
      new Token(
        name: 'agent_name',
        description: 'The agent human-readable name.',
        classes: [A2AAgentEvent::class],
      ),
      new Token(
        name: 'agent_type',
        description: 'The agent type (ossa, mcp, custom).',
        classes: [A2AAgentEvent::class],
      ),
      new Token(
        name: 'endpoint',
        description: 'The agent endpoint URL.',
        classes: [A2AAgentEvent::class],
      ),
      new Token(
        name: 'capabilities',
        description: 'The agent capabilities as JSON string.',
        classes: [A2AAgentEvent::class],
      ),
      new Token(
        name: 'action',
        description: 'The lifecycle action (registered or unregistered).',
        classes: [A2AAgentEvent::class],
      ),
      new Token(
        name: 'machine_name',
        description: 'The machine name of the ECA event.',
      ),
    ],
  )]
  protected function buildEventData(): array {
    $event = $this->getEvent();
    $data = [
      'machine_name' => $this->eventName(),
    ];

    if ($event instanceof A2AMessageEvent) {
      $data['message_id'] = $event->getMessageId();
      $data['from_agent'] = $event->getFromAgent();
      $data['to_agent'] = $event->getToAgent();
      $data['message_type'] = $event->getMessageType();
      $data['status'] = $event->getStatus();
      $data['error'] = $event->getError();
      $data['payload'] = json_encode($event->getPayload(), JSON_UNESCAPED_SLASHES);
      $data['response'] = json_encode($event->getResponse(), JSON_UNESCAPED_SLASHES);
    }
    elseif ($event instanceof A2AAgentEvent) {
      $data['agent_id'] = $event->getAgentId();
      $data['agent_name'] = $event->getAgentName();
      $data['agent_type'] = $event->getAgentType();
      $data['endpoint'] = $event->getEndpoint();
      $data['capabilities'] = json_encode($event->getCapabilities(), JSON_UNESCAPED_SLASHES);
      $data['action'] = $event->getAction();
    }

    return $data;
  }

}
