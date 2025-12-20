import * as jwt from 'jsonwebtoken';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import authConfig from '../config/authConfig';
import type { ConfigType } from '@nestjs/config';
import { UserAuth } from '../types/userAuth.type';

interface User {
  user_id: string;
  role: string;
  token_version: number;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(authConfig.KEY) private config: ConfigType<typeof authConfig>,
  ) {}

  verify(token: string): UserAuth {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as unknown as (
        | jwt.JwtPayload
        | string
      ) &
        User;

      const { user_id, role, token_version } = payload;

      return {
        userId: user_id,
        role,
        tokenVersion: token_version,
      };
    } catch (e) {
      throw new UnauthorizedException(e);
    }
  }
}
