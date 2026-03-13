<?php
namespace Drupal\bluefly_agent_platform\Contracts;
use Drupal\bluefly_agent_platform\Dto\Flow\ExecuteFlowRequestDto;
use Drupal\bluefly_agent_platform\Dto\Flow\ExecuteByNameRequestDto;
use Drupal\bluefly_agent_platform\Dto\Flow\FlowResponseDto;

interface WorkflowEngineClientInterface {
  public function executeFlowById(string $flowId, ExecuteFlowRequestDto $dto): FlowResponseDto;
  // ...
}
