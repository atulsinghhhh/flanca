-- CreateEnum
CREATE TYPE "SkillRating" AS ENUM ('BEGINNING', 'DEVELOPING', 'PROFICIENT');

-- CreateTable
CREATE TABLE "SkillAssessment" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "examTermId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "rating" "SkillRating" NOT NULL,
    "enteredBy" UUID,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SkillAssessment_schoolId_studentId_idx" ON "SkillAssessment"("schoolId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillAssessment_examTermId_subjectId_studentId_key" ON "SkillAssessment"("examTermId", "subjectId", "studentId");

-- AddForeignKey
ALTER TABLE "SkillAssessment" ADD CONSTRAINT "SkillAssessment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillAssessment" ADD CONSTRAINT "SkillAssessment_examTermId_fkey" FOREIGN KEY ("examTermId") REFERENCES "ExamTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillAssessment" ADD CONSTRAINT "SkillAssessment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillAssessment" ADD CONSTRAINT "SkillAssessment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
