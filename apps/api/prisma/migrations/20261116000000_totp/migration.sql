-- AlterTable
ALTER TABLE "users" ADD COLUMN     "backup_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totp_last_step" INTEGER;

