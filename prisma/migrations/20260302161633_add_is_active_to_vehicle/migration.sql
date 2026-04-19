-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "group_id" INTEGER,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- DropEnum
DROP TYPE "TransactionStatus";

-- DropEnum
DROP TYPE "TransactionType";

-- CreateTable
CREATE TABLE "vehicle_groups" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_documents" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "doc_type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200),
    "file_key" VARCHAR(255) NOT NULL,
    "url" VARCHAR(500),
    "issue_date" DATE,
    "expiry_date" DATE,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_booking_stops" (
    "id" SERIAL NOT NULL,
    "booking_id" UUID NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "order" INTEGER NOT NULL,
    "note" VARCHAR(255),

    CONSTRAINT "car_booking_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_groups_org_id_code_key" ON "vehicle_groups"("org_id", "code");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "vehicle_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_booking_stops" ADD CONSTRAINT "car_booking_stops_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "car_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
