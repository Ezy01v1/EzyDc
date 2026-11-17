import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { CreateRoleInput, IdParam, OverwriteInput, ReorderRolesInput, UpdateRoleInput } from '@ezydc/shared';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { RolesService } from './roles.service';

const id = () => new ZodPipe(IdParam);

@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Post('servers/:id/roles')
  create(@CurrentUser() me: string, @Param('id', id()) serverId: string, @Body(new ZodPipe(CreateRoleInput)) body: CreateRoleInput) {
    return this.roles.create(serverId, me, body);
  }

  // Declarada antes que :roleId para que "positions" no se interprete como id.
  @HttpCode(204)
  @Patch('servers/:id/roles/positions')
  reorder(@CurrentUser() me: string, @Param('id', id()) serverId: string, @Body(new ZodPipe(ReorderRolesInput)) body: ReorderRolesInput) {
    return this.roles.reorder(serverId, me, body);
  }

  @Patch('servers/:id/roles/:roleId')
  update(
    @CurrentUser() me: string,
    @Param('id', id()) serverId: string,
    @Param('roleId', id()) roleId: string,
    @Body(new ZodPipe(UpdateRoleInput)) body: UpdateRoleInput,
  ) {
    return this.roles.update(serverId, roleId, me, body);
  }

  @HttpCode(204)
  @Delete('servers/:id/roles/:roleId')
  remove(@CurrentUser() me: string, @Param('id', id()) serverId: string, @Param('roleId', id()) roleId: string) {
    return this.roles.remove(serverId, roleId, me);
  }

  @Put('servers/:id/members/:userId/roles/:roleId')
  addRole(
    @CurrentUser() me: string,
    @Param('id', id()) serverId: string,
    @Param('userId', id()) userId: string,
    @Param('roleId', id()) roleId: string,
  ) {
    return this.roles.setMemberRole(serverId, userId, roleId, me, true);
  }

  @Delete('servers/:id/members/:userId/roles/:roleId')
  removeRole(
    @CurrentUser() me: string,
    @Param('id', id()) serverId: string,
    @Param('userId', id()) userId: string,
    @Param('roleId', id()) roleId: string,
  ) {
    return this.roles.setMemberRole(serverId, userId, roleId, me, false);
  }

  @Get('channels/:id/overwrites')
  overwrites(@CurrentUser() me: string, @Param('id', id()) channelId: string) {
    return this.roles.listOverwrites(channelId, me);
  }

  @Put('channels/:id/overwrites/:targetId')
  putOverwrite(
    @CurrentUser() me: string,
    @Param('id', id()) channelId: string,
    @Param('targetId', id()) targetId: string,
    @Body(new ZodPipe(OverwriteInput)) body: OverwriteInput,
  ) {
    return this.roles.putOverwrite(channelId, targetId, me, body);
  }

  @HttpCode(204)
  @Delete('channels/:id/overwrites/:targetId')
  deleteOverwrite(@CurrentUser() me: string, @Param('id', id()) channelId: string, @Param('targetId', id()) targetId: string) {
    return this.roles.deleteOverwrite(channelId, targetId, me);
  }
}
