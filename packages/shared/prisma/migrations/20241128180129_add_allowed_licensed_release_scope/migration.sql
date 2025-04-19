-- CreateTable
CREATE TABLE "_LicenseToRelease" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_LicenseToRelease_AB_unique" ON "_LicenseToRelease"("A", "B");

-- CreateIndex
CREATE INDEX "_LicenseToRelease_B_index" ON "_LicenseToRelease"("B");

-- AddForeignKey
ALTER TABLE "_LicenseToRelease" ADD CONSTRAINT "_LicenseToRelease_A_fkey" FOREIGN KEY ("A") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LicenseToRelease" ADD CONSTRAINT "_LicenseToRelease_B_fkey" FOREIGN KEY ("B") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
