-- CreateTable
CREATE TABLE "public"."ProductDiscordRole" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDiscordRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductDiscordRole_teamId_idx" ON "public"."ProductDiscordRole"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDiscordRole_productId_roleId_guildId_key" ON "public"."ProductDiscordRole"("productId", "roleId", "guildId");

-- AddForeignKey
ALTER TABLE "public"."ProductDiscordRole" ADD CONSTRAINT "ProductDiscordRole_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductDiscordRole" ADD CONSTRAINT "ProductDiscordRole_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductDiscordRole" ADD CONSTRAINT "ProductDiscordRole_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
