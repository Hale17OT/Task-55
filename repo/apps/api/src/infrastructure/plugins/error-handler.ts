import { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler(function (
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Internal server error');
    } else {
      request.log.warn({ err: error, statusCode }, 'Client error');
    }

    // Handle rate-limit errors (429) with their custom response shape
    if (statusCode === 429) {
      return reply.status(429).send({
        error: 'TOO_MANY_REQUESTS',
        message: error.message || 'Rate limit exceeded',
        retryAfter: (error as any).retryAfter,
      });
    }

    const response: { error: string; message: string; details?: unknown[] } = {
      error: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : error.code ?? 'ERROR',
      message: statusCode >= 500 ? 'Internal Server Error' : error.message,
    };

    if (error.validation) {
      response.error = 'VALIDATION_ERROR';
      response.message = 'Validation failed';
      response.details = error.validation;
    }

    reply.status(statusCode).send(response);
  });

  fastify.setNotFoundHandler(function (_request, reply) {
    reply.status(404).send({
      error: 'NOT_FOUND',
      message: 'Route not found',
    });
  });
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
  fastify: '5.x',
});
