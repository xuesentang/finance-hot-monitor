-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'generic',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Hotspot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "eventType" TEXT,
    "isSubstantial" BOOLEAN NOT NULL DEFAULT true,
    "relevance" INTEGER NOT NULL,
    "relevanceReason" TEXT,
    "keywordMentioned" BOOLEAN NOT NULL,
    "importance" TEXT NOT NULL,
    "importanceReason" TEXT,
    "summary" TEXT,
    "affectedHoldings" BOOLEAN NOT NULL DEFAULT false,
    "eventFingerprint" TEXT,
    "relatedSources" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keywordId" TEXT NOT NULL,
    CONSTRAINT "Hotspot_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'hotspot',
    "title" TEXT NOT NULL,
    "content" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hotspotId" TEXT NOT NULL,
    CONSTRAINT "Notification_hotspotId_fkey" FOREIGN KEY ("hotspotId") REFERENCES "Hotspot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceWatermark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "lastId" TEXT,
    "lastTimestamp" INTEGER,
    "extraData" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MacroObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "lastDate" TEXT NOT NULL,
    "lastValue" REAL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_text_key" ON "Keyword"("text");

-- CreateIndex
CREATE INDEX "Hotspot_keywordId_idx" ON "Hotspot"("keywordId");

-- CreateIndex
CREATE INDEX "Hotspot_eventFingerprint_idx" ON "Hotspot"("eventFingerprint");

-- CreateIndex
CREATE INDEX "Hotspot_publishedAt_idx" ON "Hotspot"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Hotspot_url_source_key" ON "Hotspot"("url", "source");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceWatermark_source_key" ON "SourceWatermark"("source");

-- CreateIndex
CREATE UNIQUE INDEX "MacroObservation_seriesId_key" ON "MacroObservation"("seriesId");
