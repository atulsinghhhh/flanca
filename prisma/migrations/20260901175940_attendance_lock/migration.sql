-- CreateTable
CREATE TABLE "AttendanceLock" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "lockedByUserId" UUID NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceLock_schoolId_sectionId_date_key" ON "AttendanceLock"("schoolId", "sectionId", "date");

-- AddForeignKey
ALTER TABLE "AttendanceLock" ADD CONSTRAINT "AttendanceLock_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLock" ADD CONSTRAINT "AttendanceLock_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLock" ADD CONSTRAINT "AttendanceLock_lockedByUserId_fkey" FOREIGN KEY ("lockedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
