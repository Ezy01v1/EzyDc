import { Permission, type PermissionName } from './permissions';

export interface PermissionInfo {
  key: PermissionName;
  label: string;
  description: string;
}

export interface PermissionGroup {
  title: string;
  /** Si el permiso tiene sentido como override de canal. */
  channel: boolean;
  items: PermissionInfo[];
}

const p = (key: PermissionName, label: string, description: string): PermissionInfo => ({ key, label, description });

/** Catálogo para la UI (roles y overrides). El orden es el que se muestra. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'General',
    channel: false,
    items: [
      p('ADMINISTRATOR', 'Administrador', 'Concede TODOS los permisos y se salta los overrides de canal. Peligroso.'),
      p('MANAGE_SERVER', 'Gestionar servidor', 'Cambiar nombre, icono y ajustes del servidor.'),
      p('MANAGE_ROLES', 'Gestionar roles', 'Crear y editar roles inferiores al suyo y los overrides de canal.'),
      p('MANAGE_CHANNELS', 'Gestionar canales', 'Crear, editar, reordenar y borrar canales.'),
      p('VIEW_AUDIT_LOG', 'Ver registro de auditoría', 'Consultar el historial de acciones de moderación.'),
      p('MANAGE_EMOJIS', 'Gestionar emojis', 'Subir y borrar emojis personalizados.'),
      p('MANAGE_WEBHOOKS', 'Gestionar webhooks', 'Crear y borrar webhooks.'),
    ],
  },
  {
    title: 'Miembros',
    channel: false,
    items: [
      p('CREATE_INVITE', 'Crear invitaciones', 'Generar enlaces de invitación.'),
      p('CHANGE_NICKNAME', 'Cambiar apodo', 'Cambiar su propio apodo.'),
      p('MANAGE_NICKNAMES', 'Gestionar apodos', 'Cambiar el apodo de otros miembros.'),
      p('KICK_MEMBERS', 'Expulsar miembros', 'Echar a miembros del servidor.'),
      p('BAN_MEMBERS', 'Banear miembros', 'Banear miembros de forma permanente.'),
      p('MODERATE_MEMBERS', 'Aislar miembros', 'Aplicar timeouts temporales.'),
    ],
  },
  {
    title: 'Texto',
    channel: true,
    items: [
      p('VIEW_CHANNEL', 'Ver canal', 'Ver el canal y leer mensajes en tiempo real.'),
      p('SEND_MESSAGES', 'Enviar mensajes', 'Escribir en canales de texto.'),
      p('READ_MESSAGE_HISTORY', 'Leer historial', 'Ver mensajes anteriores a su llegada.'),
      p('MANAGE_MESSAGES', 'Gestionar mensajes', 'Borrar mensajes de otros.'),
      p('EMBED_LINKS', 'Insertar enlaces', 'Mostrar previews de enlaces.'),
      p('ATTACH_FILES', 'Adjuntar archivos', 'Subir archivos e imágenes.'),
      p('ADD_REACTIONS', 'Añadir reacciones', 'Reaccionar con emojis.'),
      p('USE_EXTERNAL_EMOJIS', 'Emojis externos', 'Usar emojis de otros servidores.'),
      p('MENTION_EVERYONE', 'Mencionar @everyone', 'Notificar a todos los miembros.'),
      p('CREATE_THREADS', 'Crear hilos', 'Abrir hilos a partir de mensajes.'),
      p('SEND_MESSAGES_IN_THREADS', 'Escribir en hilos', 'Participar en hilos.'),
    ],
  },
  {
    title: 'Voz',
    channel: true,
    items: [
      p('CONNECT', 'Conectar', 'Entrar a canales de voz.'),
      p('SPEAK', 'Hablar', 'Transmitir audio.'),
      p('STREAM', 'Vídeo y pantalla', 'Compartir cámara o pantalla.'),
      p('MUTE_MEMBERS', 'Silenciar miembros', 'Silenciar a otros en voz.'),
      p('DEAFEN_MEMBERS', 'Ensordecer miembros', 'Ensordecer a otros en voz.'),
      p('MOVE_MEMBERS', 'Mover miembros', 'Mover a otros entre canales de voz.'),
    ],
  },
];

export const permissionBit = (key: PermissionName): bigint => Permission[key];
