<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Form;

use Drupal\bluefly_agent_platform\Entity\A2aAgentInterface;
use Drupal\Core\Entity\EntityForm;
use Drupal\Core\Form\FormStateInterface;

/**
 * Form handler for A2A Agent add/edit.
 */
class A2aAgentForm extends EntityForm {

  /**
   * {@inheritdoc}
   */
  public function form(array $form, FormStateInterface $form_state): array {
    $form = parent::form($form, $form_state);

    /** @var \Drupal\bluefly_agent_platform\Entity\A2aAgentInterface $entity */
    $entity = $this->entity;

    $form['id'] = [
      '#type' => 'machine_name',
      '#title' => $this->t('Agent ID'),
      '#default_value' => $entity->id(),
      '#machine_name' => [
        'exists' => [$this, 'exists'],
        'source' => ['label'],
      ],
      '#disabled' => !$entity->isNew(),
      '#description' => $this->t('Unique machine name (e.g. my_agent).'),
    ];

    $form['label'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Agent name'),
      '#maxlength' => 255,
      '#default_value' => $entity->label(),
      '#required' => TRUE,
    ];

    $form['endpoint_url'] = [
      '#type' => 'url',
      '#title' => $this->t('Endpoint URL'),
      '#default_value' => $entity->getEndpointUrl(),
      '#required' => TRUE,
      '#description' => $this->t('URL where the agent receives A2A messages.'),
    ];

    $form['agent_type'] = [
      '#type' => 'select',
      '#title' => $this->t('Agent type'),
      '#options' => [
        'ossa' => $this->t('OSSA'),
        'mcp' => $this->t('MCP'),
        'custom' => $this->t('Custom'),
      ],
      '#default_value' => $entity->getAgentType(),
    ];

    $capabilities = $entity->getCapabilities();
    $form['capabilities'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Capabilities'),
      '#default_value' => $capabilities !== [] ? json_encode($capabilities, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) : '',
      '#rows' => 6,
      '#description' => $this->t('JSON array of capability descriptors (e.g. [{"name":"tool_x","type":"tool"}]). Leave empty for none.'),
      '#attributes' => ['style' => 'font-family: monospace;'],
    ];

    $ossa = $entity->getOssaManifest();
    $form['ossa_manifest'] = [
      '#type' => 'textarea',
      '#title' => $this->t('OSSA manifest (optional)'),
      '#default_value' => $ossa !== NULL ? json_encode($ossa, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) : '',
      '#rows' => 8,
      '#description' => $this->t('Optional JSON object of OSSA manifest data.'),
      '#attributes' => ['style' => 'font-family: monospace;'],
    ];

    $form['status'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Active'),
      '#default_value' => $entity->isNew() ? TRUE : $entity->status(),
    ];

    return $form;
  }

  /**
   * Machine name exists callback.
   */
  public function exists(string $value): bool {
    $storage = $this->entityTypeManager->getStorage('a2a_agent');
    return $storage->load($value) !== NULL;
  }

  /**
   * {@inheritdoc}
   */
  public function validateForm(array &$form, FormStateInterface $form_state): void {
    parent::validateForm($form, $form_state);

    $cap = trim((string) $form_state->getValue('capabilities'));
    if ($cap !== '') {
      $decoded = json_decode($cap, TRUE);
      if (!is_array($decoded)) {
        $form_state->setError($form['capabilities'], $this->t('Capabilities must be a valid JSON array.'));
      }
    }

    $ossa = trim((string) $form_state->getValue('ossa_manifest'));
    if ($ossa !== '') {
      $decoded = json_decode($ossa, TRUE);
      if (!is_array($decoded)) {
        $form_state->setError($form['ossa_manifest'], $this->t('OSSA manifest must be a valid JSON object.'));
      }
    }
  }

  /**
   * {@inheritdoc}
   */
  public function save(array $form, FormStateInterface $form_state): int {
    /** @var \Drupal\bluefly_agent_platform\Entity\A2aAgentInterface $entity */
    $entity = $this->entity;

    $cap = trim((string) $form_state->getValue('capabilities'));
    $entity->setCapabilities($cap !== '' ? json_decode($cap, TRUE) : []);

    $ossa = trim((string) $form_state->getValue('ossa_manifest'));
    $entity->setOssaManifest($ossa !== '' ? json_decode($ossa, TRUE) : NULL);

    if ($entity->isNew()) {
      $entity->setCreated($this->getRequest()->server->get('REQUEST_TIME') ?: time());
      $entity->setLastSeen($entity->getCreated());
    }

    $entity->save();

    $this->messenger()->addStatus($this->t('Saved the A2A agent %label.', ['%label' => $entity->label()]));
    $form_state->setRedirectUrl($entity->toUrl('collection'));
    return static::SAVED;
  }

}
