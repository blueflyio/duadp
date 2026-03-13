<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Service;

use Drupal\ai\AiProviderPluginManager;
use Drupal\ai\OperationType\Chat\ChatInput;
use Drupal\ai\OperationType\Chat\ChatMessage;
use Psr\Log\LoggerInterface;

/**
 * AI provider integration service for agent client LLM operations.
 *
 * Wraps drupal/ai provider system to replace direct HTTP gateway calls
 * for chat completions, using whatever provider the site admin configures.
 */
class ClientAiService {

  public function __construct(
    protected AiProviderPluginManager $aiProvider,
    protected LoggerInterface $logger,
  ) {}

  /**
   * Send a chat request through the configured AI provider.
   *
   * @param string $systemPrompt
   *   The system prompt.
   * @param string $userPrompt
   *   The user prompt.
   * @param string|null $model
   *   Optional model override. Uses site default if NULL.
   *
   * @return string
   *   The response text, or a fallback message on failure.
   */
  public function chat(string $systemPrompt, string $userPrompt, ?string $model = NULL): string {
    try {
      $sets = $this->aiProvider->getDefaultProviderForOperationType('chat');
      $provider = $this->aiProvider->createInstance($sets['provider_id']);
      $modelId = $model ?? $sets['model_id'];
      $messages = new ChatInput([
        new ChatMessage('system', $systemPrompt),
        new ChatMessage('user', $userPrompt),
      ]);
      return $provider->chat($messages, $modelId)->getNormalized()->getText();
    }
    catch (\Exception $e) {
      $this->logger->warning('AI chat failed: @error', ['@error' => $e->getMessage()]);
      return 'AI unavailable. Configure a default chat provider at /admin/config/ai/settings.';
    }
  }

  /**
   * Get available AI provider definitions.
   *
   * @return array
   *   Keyed by provider ID, values are human-readable labels.
   */
  public function getAvailableProviders(): array {
    $providers = [];
    foreach ($this->aiProvider->getDefinitions() as $id => $def) {
      $providers[$id] = $def['label'] ?? $id;
    }
    return $providers;
  }

}
