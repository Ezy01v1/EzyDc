import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreateDmInput, IdParam } from '@ezydc/shared';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { DmsService } from './dms.service';

const id = () => new ZodPipe(IdParam);

@Controller()
export class DmsController {
  constructor(private readonly dms: DmsService) {}

  @Get('users/me/channels')
  list(@CurrentUser() me: string) {
    return this.dms.list(me);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('users/me/channels')
  create(@CurrentUser() me: string, @Body(new ZodPipe(CreateDmInput)) body: CreateDmInput) {
    return this.dms.create(me, body);
  }

  @Get('users/me/contacts')
  contacts(@CurrentUser() me: string) {
    return this.dms.contacts(me);
  }

  @HttpCode(204)
  @Delete('channels/:id/recipients/@me')
  leave(@CurrentUser() me: string, @Param('id', id()) channelId: string) {
    return this.dms.leave(me, channelId);
  }

  @Put('channels/:id/recipients/:userId')
  add(@CurrentUser() me: string, @Param('id', id()) channelId: string, @Param('userId', id()) userId: string) {
    return this.dms.addRecipient(me, channelId, userId);
  }
}
