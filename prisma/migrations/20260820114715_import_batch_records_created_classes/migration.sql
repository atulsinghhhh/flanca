-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "createdClassIds" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "createdSectionIds" UUID[] DEFAULT ARRAY[]::UUID[];
