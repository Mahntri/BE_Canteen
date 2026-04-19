-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('PERIODIC', 'MANUAL');

-- AlterTable
ALTER TABLE "dish_reviews" ADD COLUMN     "type" "ReviewType" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "type" "ReviewType" NOT NULL DEFAULT 'MANUAL';
