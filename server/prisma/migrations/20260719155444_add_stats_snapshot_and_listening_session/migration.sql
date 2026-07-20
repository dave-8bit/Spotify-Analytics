-- CreateTable
CREATE TABLE "StatsSnapshot" (
    "userId" INTEGER NOT NULL,
    "totalPlays" INTEGER NOT NULL,
    "totalMinutes" DOUBLE PRECISION NOT NULL,
    "uniqueTracks" INTEGER NOT NULL,
    "uniqueArtists" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatsSnapshot_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ListeningSession" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "trackCount" INTEGER NOT NULL,
    "totalMs" INTEGER NOT NULL,

    CONSTRAINT "ListeningSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListeningSession_userId_startedAt_idx" ON "ListeningSession"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "StatsSnapshot" ADD CONSTRAINT "StatsSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListeningSession" ADD CONSTRAINT "ListeningSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
