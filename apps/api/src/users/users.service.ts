import { Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateProfileInput, UserPublic, UserSelf } from '@ezydc/shared';
import { toUserSelf, userPublicSelect } from '../common/mappers';
import { PrismaService } from '../core/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getSelf(userId: string): Promise<UserSelf> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException();
    return toUserSelf(u);
  }

  async getPublic(userId: string): Promise<UserPublic & { bio: string | null; customStatus: string | null }> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...userPublicSelect, bio: true, customStatus: true },
    });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return u;
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserSelf> {
    const u = await this.prisma.user.update({ where: { id: userId }, data: input });
    return toUserSelf(u);
  }
}
