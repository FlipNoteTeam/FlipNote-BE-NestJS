import { Controller, Get, UseGuards } from '@nestjs/common';
import type { UserAuth } from '../types/userAuth.type';
import { AuthUser } from '../decorators/auth-user.decorator';
import { AuthGuard } from '../auth.guard';
import { successResponse } from '../common/utils/response.util';

@Controller('auth')
export class AuthController {
  @UseGuards(AuthGuard)
  @Get('test')
  test(@AuthUser() userAuth: UserAuth) {
    return successResponse(userAuth);
  }
}
