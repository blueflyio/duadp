<?php

namespace Drupal\duadp_discovery\Form;

use Drupal\Core\Entity\EntityForm;
use Drupal\Core\Form\FormStateInterface;

/**
 * Form for adding/editing a DuadpNode config entity.
 */
class DuadpNodeForm extends EntityForm {

  /**
   * {@inheritdoc}
   */
  public function form(array $form, FormStateInterface $form_state): array {
    $form = parent::form($form, $form_state);
    /** @var \Drupal\duadp_discovery\Entity\DuadpNode $entity */
    $entity = $this->entity;

    $form['label'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Label'),
      '#maxlength' => 255,
      '#default_value' => $entity->label(),
      '#required' => TRUE,
    ];

    $form['id'] = [
      '#type' => 'machine_name',
      '#default_value' => $entity->id(),
      '#machine_name' => [
        'exists' => '\Drupal\duadp_discovery\Entity\DuadpNode::load',
      ],
      '#disabled' => !$entity->isNew(),
    ];

    $form['connection'] = [
      '#type' => 'details',
      '#title' => $this->t('Connection'),
      '#open' => TRUE,
    ];

    $form['connection']['node_url'] = [
      '#type' => 'url',
      '#title' => $this->t('Node URL'),
      '#description' => $this->t('The base URL of the remote DUADP registry node. E.g., <code>https://discover.duadp.org</code>'),
      '#default_value' => $entity->node_url,
      '#required' => TRUE,
    ];

    $form['connection']['node_id'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Node DID'),
      '#description' => $this->t('The W3C DID of the remote node. E.g., <code>did:web:discover.duadp.org</code>'),
      '#default_value' => $entity->node_id,
    ];

    $form['connection']['auth_token_key'] = [
      '#type' => 'key_select',
      '#title' => $this->t('Bearer Token (Key)'),
      '#description' => $this->t('Select a Key entity holding the Bearer token for authenticated publish requests. Leave empty for unauthenticated nodes.'),
      '#default_value' => $entity->auth_token_key,
      '#empty_option' => $this->t('— None —'),
    ];

    $form['publish'] = [
      '#type' => 'details',
      '#title' => $this->t('Publish Settings'),
      '#open' => TRUE,
    ];

    $form['publish']['trust_tier'] = [
      '#type' => 'select',
      '#title' => $this->t('Trust Tier'),
      '#options' => [
        'community'          => $this->t('Community'),
        'signed'             => $this->t('Signed'),
        'verified-signature' => $this->t('Verified Signature'),
        'verified'           => $this->t('Verified'),
        'official'           => $this->t('Official'),
      ],
      '#default_value' => $entity->trust_tier,
    ];

    $form['publish']['sync_enabled'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable automatic sync (cron)'),
      '#default_value' => $entity->sync_enabled,
    ];

    $form['publish']['publish_agents'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Publish Agents'),
      '#default_value' => $entity->publish_agents,
    ];

    $form['publish']['publish_skills'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Publish Skills'),
      '#default_value' => $entity->publish_skills,
    ];

    $form['publish']['publish_tools'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Publish Tools'),
      '#default_value' => $entity->publish_tools,
    ];

    return $form;
  }

  /**
   * {@inheritdoc}
   */
  public function save(array $form, FormStateInterface $form_state): int {
    $entity = $this->entity;
    $status = $entity->save();
    $label = $entity->label();

    if ($status === SAVED_NEW) {
      $this->messenger()->addStatus($this->t('DUADP Node %label created.', ['%label' => $label]));
    }
    else {
      $this->messenger()->addStatus($this->t('DUADP Node %label updated.', ['%label' => $label]));
    }

    $form_state->setRedirectUrl($entity->toUrl('collection'));
    return $status;
  }

}
