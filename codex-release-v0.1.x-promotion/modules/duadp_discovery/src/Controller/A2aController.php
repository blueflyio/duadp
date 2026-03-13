<?php

declare(strict_types=1);

namespace Drupal\bluefly_agent_platform\Controller;

use Drupal\bluefly_agent_platform\Service\AgentCardBuilder;
use Drupal\Component\Serialization\Json;
use Drupal\Core\Cache\CacheableJsonResponse;
use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\DependencyInjection\ContainerInjectionInterface;
use Drupal\jsonrpc\Exception\ErrorHandler;
use Drupal\jsonrpc\Exception\JsonRpcException;
use Drupal\jsonrpc\HandlerInterface;
use Drupal\jsonrpc\Shaper\RpcRequestFactory;
use Drupal\jsonrpc\Shaper\RpcResponseFactory;
use JsonSchema\Validator;
use Shaper\Util\Context;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Controller for A2A protocol endpoints.
 *
 * The /.well-known/agent-card.json endpoint serves the Agent Card.
 * The /a2a endpoint delegates to the jsonrpc Handler for JSON-RPC processing.
 */
class A2aController extends ControllerBase implements ContainerInjectionInterface {

  public function __construct(
    protected readonly AgentCardBuilder $agentCardBuilder,
    protected readonly HandlerInterface $handler,
    protected readonly Validator $validator,
    protected readonly ContainerInterface $serviceContainer,
    protected readonly ErrorHandler $errorHandler,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('ai_agents_communication.agent_card_builder'),
      $container->get('jsonrpc.handler'),
      $container->get('jsonrpc.schema_validator'),
      $container->get('service_container'),
      $container->get(ErrorHandler::class),
    );
  }

  /**
   * GET /.well-known/agent-card.json — Agent Card discovery.
   *
   * Public endpoint, no authentication required.
   */
  public function agentCard(): JsonResponse {
    $agentCard = $this->agentCardBuilder->build();

    return new JsonResponse(
      $agentCard->jsonSerialize(),
      Response::HTTP_OK,
      ['Cache-Control' => 'public, max-age=300'],
    );
  }

  /**
   * POST /a2a — JSON-RPC 2.0 endpoint.
   *
   * Delegates to the jsonrpc module's Handler which routes to our
   * @JsonRpcMethod plugins (message/send, tasks/get, tasks/cancel).
   * Pattern follows jsonrpc HttpController::resolve().
   */
  public function endpoint(Request $request): Response {
    $version = $this->handler::supportedVersion();

    // Parse JSON-RPC request.
    try {
      $content = Json::decode($request->getContent(FALSE));
      $context = new Context([
        RpcRequestFactory::REQUEST_VERSION_KEY => $version,
      ]);
      $factory = new RpcRequestFactory($this->handler, $this->serviceContainer, $this->validator);
      $rpcRequests = $factory->transform($content, $context);
    }
    catch (JsonRpcException $e) {
      $this->errorHandler->logServerError($e);
      return $this->exceptionResponse($e, $version, Response::HTTP_BAD_REQUEST);
    }
    catch (\Exception | \TypeError $e) {
      $wrapped = JsonRpcException::fromPrevious($e, FALSE, $version);
      return $this->exceptionResponse($wrapped, $version, Response::HTTP_BAD_REQUEST);
    }

    // Execute via jsonrpc Handler.
    try {
      $rpcResponses = $this->handler->batch($rpcRequests);

      if (empty($rpcResponses)) {
        return new CacheableJsonResponse(NULL, Response::HTTP_NO_CONTENT);
      }

      $isBatched = count($rpcRequests) !== 1 || $rpcRequests[0]->isInBatch();
      $serializeContext = new Context([
        RpcResponseFactory::RESPONSE_VERSION_KEY => $version,
        RpcRequestFactory::REQUEST_IS_BATCH_REQUEST => $isBatched,
      ]);
      $normalizer = new RpcResponseFactory($this->validator);
      $serialized = Json::encode($normalizer->transform(array_values($rpcResponses), $serializeContext));

      return CacheableJsonResponse::fromJsonString($serialized, Response::HTTP_OK);
    }
    catch (JsonRpcException $e) {
      $this->errorHandler->logServerError($e);
      return $this->exceptionResponse($e, $version, Response::HTTP_INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Build an error response from a JsonRpcException.
   */
  protected function exceptionResponse(JsonRpcException $e, string $version, int $status): Response {
    $context = new Context([
      RpcResponseFactory::RESPONSE_VERSION_KEY => $version,
      RpcRequestFactory::REQUEST_IS_BATCH_REQUEST => FALSE,
    ]);
    $normalizer = new RpcResponseFactory($this->validator);
    $rpcResponse = $e->getResponse();
    $serialized = Json::encode($normalizer->transform([$rpcResponse], $context));
    return CacheableJsonResponse::fromJsonString($serialized, $status);
  }

}
