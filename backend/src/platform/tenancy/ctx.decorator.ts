import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { RequestContext } from './request-context.js';

export const Ctx = createParamDecorator((_data: unknown, context: ExecutionContext): RequestContext => {
  const req = GqlExecutionContext.create(context).getContext().req;
  return req.ctx as RequestContext;
});
