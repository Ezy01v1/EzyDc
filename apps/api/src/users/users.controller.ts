import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { IdParam, UpdateProfileInput, type UserSelf } from '@ezydc/shared';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() userId: string): Promise<UserSelf> {
    return this.users.getSelf(userId);
  }

  @Patch('me')
  update(
    @CurrentUser() userId: string,
    @Body(new ZodPipe(UpdateProfileInput)) body: UpdateProfileInput,
  ): Promise<UserSelf> {
    return this.users.updateProfile(userId, body);
  }

  @Get(':id')
  get(@Param('id', new ZodPipe(IdParam)) id: string) {
    return this.users.getPublic(id);
  }
}
