import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreateInviteInput, CreateServerInput, IdParam, PageQuery } from '@ezydc/shared';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ServersService } from './servers.service';

const InviteCode = z.string().regex(/^[A-Za-z0-9]{4,16}$/);

@Controller()
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Get('servers')
  list(@CurrentUser() userId: string) {
    return this.servers.listForUser(userId);
  }

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } }) // 10 servidores/hora
  @Post('servers')
  create(@CurrentUser() userId: string, @Body(new ZodPipe(CreateServerInput)) body: CreateServerInput) {
    return this.servers.create(userId, body);
  }

  @Get('servers/:id')
  detail(@CurrentUser() userId: string, @Param('id', new ZodPipe(IdParam)) id: string) {
    return this.servers.detail(id, userId);
  }

  @HttpCode(204)
  @Delete('servers/:id')
  remove(@CurrentUser() userId: string, @Param('id', new ZodPipe(IdParam)) id: string) {
    return this.servers.remove(id, userId);
  }

  @Get('servers/:id/members')
  members(
    @CurrentUser() userId: string,
    @Param('id', new ZodPipe(IdParam)) id: string,
    @Query(new ZodPipe(PageQuery)) q: PageQuery,
  ) {
    return this.servers.members(id, userId, q);
  }

  @HttpCode(204)
  @Delete('servers/:id/members/@me')
  leave(@CurrentUser() userId: string, @Param('id', new ZodPipe(IdParam)) id: string) {
    return this.servers.leave(id, userId);
  }

  @Post('servers/:id/invites')
  createInvite(
    @CurrentUser() userId: string,
    @Param('id', new ZodPipe(IdParam)) id: string,
    @Body(new ZodPipe(CreateInviteInput)) body: CreateInviteInput,
  ) {
    return this.servers.createInvite(id, userId, body);
  }

  @Get('invites/:code')
  previewInvite(@Param('code', new ZodPipe(InviteCode)) code: string) {
    return this.servers.previewInvite(code);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('invites/:code')
  join(@CurrentUser() userId: string, @Param('code', new ZodPipe(InviteCode)) code: string) {
    return this.servers.joinByInvite(code, userId);
  }
}
