import { Injectable } from '@nestjs/common';
import type { ServerToClientEvents } from '@ezydc/shared';
import type { Server } from 'socket.io';

export const room = {
  user: (id: string) => `user:${id}`,
  server: (id: string) => `srv:${id}`,
  channel: (id: string) => `ch:${id}`,
};

/**
 * Fachada para emitir eventos desde los servicios REST sin depender del gateway.
 * Con el adapter de Redis, las emisiones llegan a sockets de cualquier instancia.
 */
@Injectable()
export class RealtimeService {
  server: Server | null = null;

  emit<E extends keyof ServerToClientEvents>(
    target: string | string[],
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ): void {
    // ¡Cuidado! io.to([]) emitiría a TODOS los sockets: una lista vacía no envía nada.
    if (Array.isArray(target) && target.length === 0) return;
    this.server?.to(target).emit(event, payload);
  }

  /** Une todas las conexiones del usuario a la sala del servidor (p. ej. al unirse por invitación). */
  joinServerRoom(userId: string, serverId: string): void {
    this.server?.in(room.user(userId)).socketsJoin(room.server(serverId));
  }

  leaveRooms(userId: string, rooms: string[]): void {
    if (rooms.length) this.server?.in(room.user(userId)).socketsLeave(rooms);
  }

  /** Expulsa a todos los sockets de unas salas (p. ej. servidor eliminado). */
  clearRooms(rooms: string[]): void {
    if (rooms.length) this.server?.in(rooms).socketsLeave(rooms);
  }
}
