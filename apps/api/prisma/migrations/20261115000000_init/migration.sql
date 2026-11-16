-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ONLINE', 'IDLE', 'DND', 'INVISIBLE');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('TEXT', 'VOICE', 'ANNOUNCEMENT', 'CATEGORY', 'DM', 'GROUP_DM', 'THREAD');

-- CreateEnum
CREATE TYPE "OverwriteType" AS ENUM ('ROLE', 'MEMBER');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('DEFAULT', 'REPLY', 'MEMBER_JOIN', 'THREAD_STARTER', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('FRIEND', 'BLOCKED', 'PENDING_INCOMING', 'PENDING_OUTGOING');

-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('ALL', 'MENTIONS', 'NONE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "display_name" VARCHAR(32),
    "password_hash" TEXT NOT NULL,
    "avatar_url" TEXT,
    "banner_url" TEXT,
    "bio" VARCHAR(190),
    "custom_status" VARCHAR(128),
    "status" "UserStatus" NOT NULL DEFAULT 'ONLINE',
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "prev_token_hash" TEXT,
    "rotated_at" TIMESTAMP(3),
    "user_agent" VARCHAR(256),
    "ip" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "theme" VARCHAR(16) NOT NULL DEFAULT 'dark',
    "accent_color" INTEGER,
    "font_scale" INTEGER NOT NULL DEFAULT 100,
    "custom_theme" JSONB,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "user_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "type" "RelationshipType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("user_id","target_id")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "icon_url" TEXT,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "server_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "nickname" VARCHAR(32),
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeout_until" TIMESTAMP(3),

    CONSTRAINT "members_pkey" PRIMARY KEY ("server_id","user_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "permissions" BIGINT NOT NULL DEFAULT 0,
    "hoist" BOOLEAN NOT NULL DEFAULT false,
    "mentionable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_roles" (
    "server_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "member_roles_pkey" PRIMARY KEY ("server_id","user_id","role_id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL,
    "server_id" UUID,
    "parent_id" UUID,
    "type" "ChannelType" NOT NULL,
    "name" VARCHAR(100),
    "topic" VARCHAR(1024),
    "position" INTEGER NOT NULL DEFAULT 0,
    "slowmode_seconds" INTEGER NOT NULL DEFAULT 0,
    "nsfw" BOOLEAN NOT NULL DEFAULT false,
    "user_limit" INTEGER,
    "owner_id" UUID,
    "starter_message_id" UUID,
    "last_message_id" UUID,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_overwrites" (
    "channel_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "type" "OverwriteType" NOT NULL,
    "allow" BIGINT NOT NULL DEFAULT 0,
    "deny" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "permission_overwrites_pkey" PRIMARY KEY ("channel_id","target_id")
);

-- CreateTable
CREATE TABLE "dm_participants" (
    "channel_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dm_participants_pkey" PRIMARY KEY ("channel_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "author_id" UUID,
    "webhook_id" UUID,
    "type" "MessageType" NOT NULL DEFAULT 'DEFAULT',
    "content" VARCHAR(4000) NOT NULL,
    "reply_to_id" UUID,
    "mention_everyone" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "embeds" JSONB,
    "edited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(127) NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "emoji" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("message_id","emoji","user_id")
);

-- CreateTable
CREATE TABLE "message_user_mentions" (
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "message_user_mentions_pkey" PRIMARY KEY ("message_id","user_id")
);

-- CreateTable
CREATE TABLE "message_role_mentions" (
    "message_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "message_role_mentions_pkey" PRIMARY KEY ("message_id","role_id")
);

-- CreateTable
CREATE TABLE "emojis" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "image_url" TEXT NOT NULL,
    "animated" BOOLEAN NOT NULL DEFAULT false,
    "creator_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emojis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "code" VARCHAR(16) NOT NULL,
    "server_id" UUID NOT NULL,
    "channel_id" UUID,
    "inviter_id" UUID,
    "max_uses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "read_states" (
    "user_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "last_read_message_id" UUID,
    "mention_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "read_states_pkey" PRIMARY KEY ("user_id","channel_id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "user_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "level" "NotificationLevel" NOT NULL DEFAULT 'ALL',
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "mute_until" TIMESTAMP(3),

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("user_id","target_id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bans" (
    "server_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "moderator_id" UUID,
    "reason" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bans_pkey" PRIMARY KEY ("server_id","user_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "target_id" UUID,
    "changes" JSONB,
    "reason" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_filters" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "pattern" VARCHAR(200) NOT NULL,
    "action" VARCHAR(16) NOT NULL DEFAULT 'BLOCK',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "bot_user_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "avatar_url" TEXT,
    "token_hash" TEXT NOT NULL,
    "creator_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "relationships_target_id_idx" ON "relationships"("target_id");

-- CreateIndex
CREATE INDEX "servers_owner_id_idx" ON "servers"("owner_id");

-- CreateIndex
CREATE INDEX "members_user_id_idx" ON "members"("user_id");

-- CreateIndex
CREATE INDEX "roles_server_id_position_idx" ON "roles"("server_id", "position");

-- CreateIndex
CREATE INDEX "member_roles_role_id_idx" ON "member_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "channels_starter_message_id_key" ON "channels"("starter_message_id");

-- CreateIndex
CREATE INDEX "channels_server_id_position_idx" ON "channels"("server_id", "position");

-- CreateIndex
CREATE INDEX "channels_parent_id_idx" ON "channels"("parent_id");

-- CreateIndex
CREATE INDEX "dm_participants_user_id_idx" ON "dm_participants"("user_id");

-- CreateIndex
CREATE INDEX "messages_channel_id_id_idx" ON "messages"("channel_id", "id" DESC);

-- CreateIndex
CREATE INDEX "messages_author_id_id_idx" ON "messages"("author_id", "id" DESC);

-- CreateIndex
CREATE INDEX "attachments_message_id_idx" ON "attachments"("message_id");

-- CreateIndex
CREATE INDEX "message_user_mentions_user_id_message_id_idx" ON "message_user_mentions"("user_id", "message_id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "emojis_server_id_name_key" ON "emojis"("server_id", "name");

-- CreateIndex
CREATE INDEX "invites_server_id_idx" ON "invites"("server_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_server_id_id_idx" ON "audit_logs"("server_id", "id" DESC);

-- CreateIndex
CREATE INDEX "word_filters_server_id_idx" ON "word_filters"("server_id");

-- CreateIndex
CREATE UNIQUE INDEX "applications_bot_user_id_key" ON "applications"("bot_user_id");

-- CreateIndex
CREATE INDEX "applications_owner_id_idx" ON "applications"("owner_id");

-- CreateIndex
CREATE INDEX "webhooks_channel_id_idx" ON "webhooks"("channel_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_server_id_user_id_fkey" FOREIGN KEY ("server_id", "user_id") REFERENCES "members"("server_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_overwrites" ADD CONSTRAINT "permission_overwrites_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_participants" ADD CONSTRAINT "dm_participants_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_participants" ADD CONSTRAINT "dm_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_user_mentions" ADD CONSTRAINT "message_user_mentions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_user_mentions" ADD CONSTRAINT "message_user_mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_role_mentions" ADD CONSTRAINT "message_role_mentions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emojis" ADD CONSTRAINT "emojis_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_states" ADD CONSTRAINT "read_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_states" ADD CONSTRAINT "read_states_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bans" ADD CONSTRAINT "bans_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bans" ADD CONSTRAINT "bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_filters" ADD CONSTRAINT "word_filters_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_bot_user_id_fkey" FOREIGN KEY ("bot_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

