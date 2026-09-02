-- CreateEnum
CREATE TYPE "HomeworkStatus" AS ENUM ('DRAFT', 'ASSIGNED', 'CLOSED');

-- AlterTable
ALTER TABLE "Homework" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "maxMarks" INTEGER,
ADD COLUMN     "status" "HomeworkStatus" NOT NULL DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "HomeworkSubmission" ADD COLUMN     "gradedAt" TIMESTAMP(3),
ADD COLUMN     "gradedByUserId" UUID;

-- AddForeignKey
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_gradedByUserId_fkey" FOREIGN KEY ("gradedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
