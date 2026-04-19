/*
  Warnings:

  - You are about to alter the column `score` on the `driver_ratings` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(2,1)`.
  - Added the required column `attitude_score` to the `driver_ratings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `comfort_score` to the `driver_ratings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicle_quality_score` to the `driver_ratings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `wait_time_score` to the `driver_ratings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "driver_ratings" ADD COLUMN     "attitude_score" INTEGER NOT NULL,
ADD COLUMN     "comfort_score" INTEGER NOT NULL,
ADD COLUMN     "vehicle_quality_score" INTEGER NOT NULL,
ADD COLUMN     "wait_time_score" INTEGER NOT NULL,
ALTER COLUMN "score" SET DATA TYPE DECIMAL(2,1);
