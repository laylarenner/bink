-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "guestId" TEXT,
    "displayName" TEXT,
    "githubUsername" TEXT,
    "xHandle" TEXT,
    "linkedinUrl" TEXT,
    "websiteUrl" TEXT,
    "notes" TEXT,
    "summary" TEXT,
    "summaryJson" TEXT,
    "summarizedAt" TIMESTAMP(3),
    "positioning" TEXT,
    "pillars" TEXT,
    "audience" TEXT,
    "topics" TEXT,
    "strategyNotes" TEXT,
    "researchKeywords" TEXT,
    "peerXHandles" TEXT,
    "peerLinkedinUrls" TEXT,
    "peerSearchQuery" TEXT,
    "strategyUpdatedAt" TIMESTAMP(3),
    "zernioProfileId" TEXT,
    "chatStartedAt" TIMESTAMP(3),

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestUsage" (
    "guestId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestUsage_pkey" PRIMARY KEY ("guestId")
);

-- CreateTable
CREATE TABLE "ContentIdea" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "pillar" TEXT,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "ideaId" TEXT,
    "platform" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledFor" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "postUrl" TEXT,
    "postError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyMessage" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "chars" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchItem" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "author" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "rawJson" TEXT,
    "digest" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingSample" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT,
    "text" TEXT NOT NULL,
    "url" TEXT,
    "postedAt" TIMESTAMP(3),
    "likes" INTEGER NOT NULL DEFAULT 0,
    "reposts" INTEGER NOT NULL DEFAULT 0,
    "replies" INTEGER NOT NULL DEFAULT 0,
    "isReply" BOOLEAN NOT NULL DEFAULT false,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "excludeReason" TEXT,
    "signal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WritingSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Profile_guestId_idx" ON "Profile"("guestId");

-- CreateIndex
CREATE INDEX "ContentIdea_profileId_status_idx" ON "ContentIdea"("profileId", "status");

-- CreateIndex
CREATE INDEX "Draft_profileId_status_idx" ON "Draft"("profileId", "status");

-- CreateIndex
CREATE INDEX "StrategyMessage_profileId_createdAt_idx" ON "StrategyMessage"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "Upload_profileId_idx" ON "Upload"("profileId");

-- CreateIndex
CREATE INDEX "ResearchItem_profileId_kind_status_idx" ON "ResearchItem"("profileId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchItem_profileId_url_key" ON "ResearchItem"("profileId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "Source_profileId_kind_key" ON "Source"("profileId", "kind");

-- CreateIndex
CREATE INDEX "WritingSample_profileId_platform_idx" ON "WritingSample"("profileId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "WritingSample_profileId_platform_externalId_key" ON "WritingSample"("profileId", "platform", "externalId");

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ContentIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyMessage" ADD CONSTRAINT "StrategyMessage_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchItem" ADD CONSTRAINT "ResearchItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingSample" ADD CONSTRAINT "WritingSample_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
