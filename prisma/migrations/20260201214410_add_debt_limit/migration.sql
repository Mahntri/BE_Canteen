-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "max_debt_amount" DECIMAL(15,2) NOT NULL DEFAULT 500000;
