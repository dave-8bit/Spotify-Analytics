-- M2 additive migration (ARCHITECTURE.md §6.2–6.3):
--   * PlayEvent gains `provider` (default 'spotify'); unique constraint moves
--     from [userId, playedAt] to [userId, provider, playedAt].
--   * ProviderAccount is created and seeded from User's token columns
--     (data migration). User token columns are kept mirrored and dropped in a
--     later milestone.

-- AlterTable
ALTER TABLE "PlayEvent" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'spotify';

-- CreateIndex (new constraint added before the old one is dropped; with the
-- default provider every existing [userId, playedAt]-unique row remains unique)
CREATE UNIQUE INDEX "PlayEvent_userId_provider_playedAt_key" ON "PlayEvent"("userId", "provider", "playedAt");

-- DropIndex
DROP INDEX "PlayEvent_userId_playedAt_key";

-- CreateTable
CREATE TABLE "ProviderAccount" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "historyCursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "syncFailCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncError" TEXT,

    CONSTRAINT "ProviderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderAccount_syncEnabled_lastSyncedAt_idx" ON "ProviderAccount"("syncEnabled", "lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAccount_provider_providerUserId_key" ON "ProviderAccount"("provider", "providerUserId");

-- AddForeignKey
ALTER TABLE "ProviderAccount" ADD CONSTRAINT "ProviderAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration (§6.3): every existing user becomes a spotify ProviderAccount
-- carrying their current credentials and sync bookkeeping.
INSERT INTO "ProviderAccount"
    ("userId", "provider", "providerUserId", "accessToken", "refreshToken", "tokenExpiresAt", "lastSyncedAt")
SELECT "id", 'spotify', "spotifyId", "accessToken", "refreshToken", "tokenExpiresAt", "lastSyncedAt"
FROM "User";
