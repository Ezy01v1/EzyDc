import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, TwoFactorService],
})
export class AuthModule {}
