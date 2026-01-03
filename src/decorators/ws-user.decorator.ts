import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserAuth } from '../types/userAuth.type';

export const WsUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserAuth => {
    const client = ctx.switchToWs().getClient<{ data: { user?: UserAuth } }>();
    return client.data?.user as UserAuth;
  },
);
