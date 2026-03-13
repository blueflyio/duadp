<?php
namespace Drupal\bluefly_agent_platform\Contracts;
use Drupal\bluefly_agent_platform\Dto\Validation\ValidationResultDto;

interface SchemaValidatorInterface {
  public function validate(array $data, string $schemaId): ValidationResultDto;
}
