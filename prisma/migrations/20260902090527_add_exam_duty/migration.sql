-- CreateTable
CREATE TABLE "ExamDuty" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamDuty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamDuty_schoolId_idx" ON "ExamDuty"("schoolId");

-- CreateIndex
CREATE INDEX "ExamDuty_staffId_idx" ON "ExamDuty"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamDuty_examId_staffId_key" ON "ExamDuty"("examId", "staffId");

-- AddForeignKey
ALTER TABLE "ExamDuty" ADD CONSTRAINT "ExamDuty_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamDuty" ADD CONSTRAINT "ExamDuty_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamDuty" ADD CONSTRAINT "ExamDuty_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
