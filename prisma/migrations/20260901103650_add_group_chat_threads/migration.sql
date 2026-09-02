-- AlterEnum
ALTER TYPE "ThreadKind" ADD VALUE 'GROUP';

-- AlterTable
ALTER TABLE "MessageThread" ADD COLUMN     "groupSectionId" UUID,
ADD COLUMN     "groupSubjectId" UUID;
