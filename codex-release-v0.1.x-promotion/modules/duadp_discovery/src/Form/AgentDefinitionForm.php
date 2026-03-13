<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Form;

use Drupal\Core\Entity\EntityForm;
use Drupal\Core\Form\FormStateInterface;

/**
 * Form handler for AgentDefinition add/edit.
 */
class AgentDefinitionForm extends EntityForm {

  /**
   * {@inheritdoc}
   */
  public function form(array $form, FormStateInterface $form_state): array {
    $form = parent::form($form, $form_state);

    /** @var \Drupal\bluefly_agent_platform\Entity\AgentDefinitionInterface $agent */
    $agent = $this->entity;

    $form['label'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Name'),
      '#default_value' => $agent->label(),
      '#required' => TRUE,
    ];

    $form['id'] = [
      '#type' => 'machine_name',
      '#default_value' => $agent->id(),
      '#machine_name' => [
        'exists' => [$this, 'exist'],
      ],
      '#disabled' => !$agent->isNew(),
    ];

    $form['description'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Description'),
      '#default_value' => $agent->getDescription(),
    ];

    $form['ossa_manifest_json'] = [
      '#type' => 'textarea',
      '#title' => $this->t('OSSA manifest (JSON)'),
      '#default_value' => $agent->getOssaManifest() ? json_encode($agent->getOssaManifest(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) : '',
      '#description' => $this->t('Paste the full OSSA manifest as JSON.'),
      '#rows' => 12,
    ];

    $form['approval_policy'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Approval policy ID'),
      '#default_value' => $agent->getApprovalPolicy(),
    ];

    $form['provider_profile'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Provider profile ID'),
      '#default_value' => $agent->getProviderProfile(),
    ];

    return $form;
  }

  /**
   * {@inheritdoc}
   */
  public function save(array $form, FormStateInterface $form_state): int {
    /** @var \Drupal\bluefly_agent_platform\Entity\AgentDefinitionInterface $agent */
    $agent = $this->entity;

    // Parse OSSA manifest JSON.
    $manifestJson = $form_state->getValue('ossa_manifest_json');
    if (!empty($manifestJson)) {
      $manifest = json_decode($manifestJson, TRUE);
      if (is_array($manifest)) {
        $agent->set('ossa_manifest', $manifest);
        $agent->set('ossa_version', $manifest['apiVersion'] ?? '');
      }
    }

    $status = $agent->save();
    $this->messenger()->addStatus($this->t('Saved agent: @label', ['@label' => $agent->label()]));
    $form_state->setRedirectUrl($agent->toUrl('collection'));
    return $status;
  }

  /**
   * Checks if an entity with the given ID exists.
   */
  public function exist(string $id): bool {
    $entity = $this->entityTypeManager
      ->getStorage('agent_definition')
      ->getQuery()
      ->accessCheck(FALSE)
      ->condition('id', $id)
      ->execute();
    return (bool) $entity;
  }

}
