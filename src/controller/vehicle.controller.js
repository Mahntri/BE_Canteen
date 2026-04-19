import prisma from "../config/prisma.js";
import {
  listVehicleQuerySchema,
  createVehicleSchema,
  updateVehicleSchema,
} from "../validation/vehicle.validation.js";
import { createVehicleDocSchema } from "../validation/vehicleDocument.validation.js";

const ymdToDate = (s) => (s ? new Date(`${s}T00:00:00.000Z`) : null);

/** Kiểm tra xe có đang được sử dụng/điều phối không:
 *  Trả về true nếu có CarBooking ở trạng thái APPROVED, ASSIGNED, hoặc ON_TRIP.
 *  - APPROVED: đã duyệt, chờ điều xe
 *  - ASSIGNED: đã điều phối (có xe + tài xế)
 *  - ON_TRIP:  đang trong chuyến
 */
const isVehicleOnTrip = async (vehicleId) => {
  const booking = await prisma.carBooking.findFirst({
    where: {
      vehicleId,
      status: { in: ["APPROVED", "ASSIGNED", "ON_TRIP"] },
    },
    select: { id: true, status: true },
  });
  return !!booking;
};

const mapVehicle = (v, isBooked = false) => ({
  id: v.id,
  orgId: v.orgId,
  code: v.code,
  name: v.name,
  plateNumber: v.plateNumber,
  type: v.type,
  seatCapacity: v.seatCapacity,
  yearOfManufacture: v.yearOfManufacture,
  color: v.color,
  fuelType: v.fuelType,
  insuranceExpiry: v.insuranceExpiry ? v.insuranceExpiry.toISOString().slice(0, 10) : null,
  registrationExpiry: v.registrationExpiry ? v.registrationExpiry.toISOString().slice(0, 10) : null,
  lastMaintenanceDate: v.lastMaintenanceDate ? v.lastMaintenanceDate.toISOString().slice(0, 10) : null,
  nextMaintenanceDate: v.nextMaintenanceDate ? v.nextMaintenanceDate.toISOString().slice(0, 10) : null,
  status: v.status,
  currentLocation: v.currentLocation,
  isActive: v.isActive,
  isBooked,
  group: v.group ? { id: v.group.id, code: v.group.code, name: v.group.name } : null,
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
});

const mapDoc = (d) => ({
  id: d.id,
  docType: d.docType,
  title: d.title,
  fileKey: d.fileKey,
  url: d.url,
  issueDate: d.issueDate ? d.issueDate.toISOString().slice(0, 10) : null,
  expiryDate: d.expiryDate ? d.expiryDate.toISOString().slice(0, 10) : null,
  note: d.note,
  createdAt: d.createdAt,
});

// GET /vehicles
export const listVehicles = async (req, res) => {
  try {
    const orgId = req.user?.orgId ?? 1;
    const { page, limit, q, status, type, groupId, expiringSoon, days } =
      listVehicleQuerySchema.parse(req.query);

    const skip = (page - 1) * limit;

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + days);

    const where = {
      orgId,
      ...(status ? { status } : {}),
      ...(type ? { type: { contains: type, mode: "insensitive" } } : {}),
      ...(groupId ? { groupId } : {}),
      ...(q
        ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { plateNumber: { contains: q, mode: "insensitive" } },
          ],
        }
        : {}),
      ...(expiringSoon
        ? {
          OR: [
            { insuranceExpiry: { lte: cutoff } },
            { registrationExpiry: { lte: cutoff } },
            { documents: { some: { expiryDate: { lte: cutoff } } } },
          ],
        }
        : {}),
    };

    const [total, data] = await Promise.all([
      prisma.vehicle.count({ where }),
      prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: "desc" },
        include: { group: true },
      }),
    ]);

    // Kiểm tra xe nào đang có booking hoạt động (APPROVED/ASSIGNED/ON_TRIP)
    const activeBookings = await prisma.carBooking.findMany({
      where: {
        vehicleId: { in: data.map((v) => v.id) },
        status: { in: ["APPROVED", "ASSIGNED", "ON_TRIP"] },
      },
      select: { vehicleId: true, status: true },
    });
    const bookedIds = new Set(activeBookings.map((b) => b.vehicleId));

    // Sync vehicle.status = ON_TRIP nếu có booking đang chạy thực tế
    const onTripIds = new Set(
      activeBookings.filter((b) => b.status === "ON_TRIP").map((b) => b.vehicleId)
    );

    // Tự động cập nhật những xe có status không đồng nhất
    const toSync = data.filter(
      (v) => (onTripIds.has(v.id) && v.status !== "ON_TRIP") ||
        (!onTripIds.has(v.id) && v.status === "ON_TRIP")
    );
    if (toSync.length > 0) {
      await Promise.all(
        toSync.map((v) =>
          prisma.vehicle.update({
            where: { id: v.id },
            data: { status: onTripIds.has(v.id) ? "ON_TRIP" : "AVAILABLE" },
          })
        )
      );
      toSync.forEach((v) => {
        v.status = onTripIds.has(v.id) ? "ON_TRIP" : "AVAILABLE";
      });
    }

    return res.json({ data: data.map((v) => mapVehicle(v, bookedIds.has(v.id))), meta: { page, limit, total } });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(422).json({ code: "VALIDATION_ERROR", errors: e.errors });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", message: e.message });
  }
};

// POST /vehicles
export const createVehicle = async (req, res) => {
  try {
    const orgId = req.user?.orgId ?? 1;
    const body = createVehicleSchema.parse(req.body);

    const created = await prisma.vehicle.create({
      data: {
        orgId,
        code: body.code,
        name: body.name,
        plateNumber: body.plateNumber,
        type: body.type,
        seatCapacity: body.seatCapacity,
        yearOfManufacture: body.yearOfManufacture,
        color: body.color ?? null,
        fuelType: body.fuelType ?? null,

        insuranceExpiry: ymdToDate(body.insuranceExpiry),
        registrationExpiry: ymdToDate(body.registrationExpiry),
        lastMaintenanceDate: ymdToDate(body.lastMaintenanceDate),
        nextMaintenanceDate: ymdToDate(body.nextMaintenanceDate),

        status: body.status ?? "AVAILABLE",
        currentLocation: body.currentLocation ?? null,
        groupId: body.groupId ?? null,
      },
      include: { group: true },
    });

    return res.status(201).json({ data: mapVehicle(created) });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(422).json({ code: "VALIDATION_ERROR", errors: e.errors });
    }
    if (e?.code === "P2002") {
      return res.status(409).json({
        code: "CONFLICT",
        message: "Trùng mã xe hoặc biển số trong org",
      });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", message: e.message });
  }
};

// GET /vehicles/:id
export const getVehicle = async (req, res) => {
  const orgId = req.user?.orgId ?? 1;
  const id = Number(req.params.id);

  const v = await prisma.vehicle.findFirst({
    where: { id, orgId },
    include: { group: true },
  });

  if (!v) return res.status(404).json({ code: "NOT_FOUND", message: "Vehicle not found" });
  return res.json({ data: mapVehicle(v) });
};

// PATCH /vehicles/:id
export const updateVehicle = async (req, res) => {
  try {
    const orgId = req.user?.orgId ?? 1;
    const id = Number(req.params.id);
    const body = updateVehicleSchema.parse(req.body);

    const existing = await prisma.vehicle.findFirst({ where: { id, orgId } });
    if (!existing) return res.status(404).json({ code: "NOT_FOUND", message: "Vehicle not found" });

    const updated = await prisma.vehicle.update({
      where: { id },
      data: {
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.plateNumber !== undefined ? { plateNumber: body.plateNumber } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.seatCapacity !== undefined ? { seatCapacity: body.seatCapacity } : {}),
        ...(body.yearOfManufacture !== undefined ? { yearOfManufacture: body.yearOfManufacture } : {}),
        ...(body.color !== undefined ? { color: body.color ?? null } : {}),
        ...(body.fuelType !== undefined ? { fuelType: body.fuelType ?? null } : {}),
        ...(body.insuranceExpiry !== undefined ? { insuranceExpiry: ymdToDate(body.insuranceExpiry) } : {}),
        ...(body.registrationExpiry !== undefined ? { registrationExpiry: ymdToDate(body.registrationExpiry) } : {}),
        ...(body.lastMaintenanceDate !== undefined ? { lastMaintenanceDate: ymdToDate(body.lastMaintenanceDate) } : {}),
        ...(body.nextMaintenanceDate !== undefined ? { nextMaintenanceDate: ymdToDate(body.nextMaintenanceDate) } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.currentLocation !== undefined ? { currentLocation: body.currentLocation ?? null } : {}),
        ...(body.groupId !== undefined ? { groupId: body.groupId ?? null } : {}),
      },
      include: { group: true },
    });

    return res.json({ data: mapVehicle(updated) });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(422).json({ code: "VALIDATION_ERROR", errors: e.errors });
    }
    if (e?.code === "P2002") {
      return res.status(409).json({ code: "CONFLICT", message: "Trùng mã xe hoặc biển số trong org" });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", message: e.message });
  }
};

// DELETE /vehicles/:id (hard delete)
export const deleteVehicle = async (req, res) => {
  const orgId = req.user?.orgId ?? 1;
  const id = Number(req.params.id);

  const existing = await prisma.vehicle.findFirst({ where: { id, orgId } });
  if (!existing) return res.status(404).json({ code: "NOT_FOUND", message: "Vehicle not found" });

  const onTrip = await isVehicleOnTrip(id);
  if (onTrip) {
    return res.status(409).json({
      code: "VEHICLE_ON_TRIP",
      message: "Không thể xóa xe đang trong chuyến.",
    });
  }

  await prisma.vehicle.delete({ where: { id } });

  return res.status(204).send();
};

// PATCH /vehicles/:id/toggle-active
export const toggleVehicleActive = async (req, res) => {
  try {
    const orgId = req.user?.orgId ?? 1;
    const id = Number(req.params.id);

    const existing = await prisma.vehicle.findFirst({ where: { id, orgId } });
    if (!existing) return res.status(404).json({ code: "NOT_FOUND", message: "Vehicle not found" });

    const onTrip = await isVehicleOnTrip(id);
    if (onTrip) {
      return res.status(409).json({
        code: "VEHICLE_ON_TRIP",
        message: "Không thể vô hiệu hóa xe đang trong chuyến.",
      });
    }

    const newIsActive = !existing.isActive;
    const updated = await prisma.vehicle.update({
      where: { id },
      data: { isActive: newIsActive },
      include: { group: true },
    });

    return res.json({ data: mapVehicle(updated) });
  } catch (e) {
    return res.status(500).json({ code: "INTERNAL_ERROR", message: e.message });
  }
};

// GET /vehicles/:id/documents
export const listVehicleDocuments = async (req, res) => {
  const orgId = req.user?.orgId ?? 1;
  const vehicleId = Number(req.params.id);

  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, orgId }, select: { id: true } });
  if (!v) return res.status(404).json({ code: "NOT_FOUND", message: "Vehicle not found" });

  const docs = await prisma.vehicleDocument.findMany({
    where: { orgId, vehicleId },
    orderBy: { id: "desc" },
  });

  return res.json({ data: docs.map(mapDoc) });
};

// POST /vehicles/:id/documents
export const createVehicleDocument = async (req, res) => {
  try {
    const orgId = req.user?.orgId ?? 1;
    const vehicleId = Number(req.params.id);
    const body = createVehicleDocSchema.parse(req.body);

    const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, orgId }, select: { id: true } });
    if (!v) return res.status(404).json({ code: "NOT_FOUND", message: "Vehicle not found" });

    // Guard: block duplicate document title (case-insensitive) on the same vehicle
    if (body.title) {
      const existingDocs = await prisma.vehicleDocument.findMany({
        where: { orgId, vehicleId },
        select: { id: true, title: true, expiryDate: true },
      });
      const duplicate = existingDocs.find(
        (d) => d.title && d.title.trim().toLowerCase() === body.title.trim().toLowerCase()
      );
      if (duplicate) {
        const isExpired =
          duplicate.expiryDate && new Date(duplicate.expiryDate) < new Date();
        return res.status(409).json({
          code: "DOC_TITLE_DUPLICATE",
          message: `Đã tồn tại giấy tờ tên "${duplicate.title}".${isExpired ? " Giấy tờ cũ đã hết hạn, vui lòng xóa trước." : " Vui lòng xóa giấy tờ cũ trước khi thêm mới."}`,
          isExpired,
        });
      }
    }

    const created = await prisma.vehicleDocument.create({
      data: {
        orgId,
        vehicleId,
        docType: body.docType,
        title: body.title ?? null,
        fileKey: body.fileKey,
        url: body.url ?? null,
        issueDate: ymdToDate(body.issueDate),
        expiryDate: ymdToDate(body.expiryDate),
        note: body.note ?? null,
      },
    });

    return res.status(201).json({ data: mapDoc(created) });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(422).json({ code: "VALIDATION_ERROR", errors: e.errors });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", message: e.message });
  }
};

// DELETE /vehicles/:id/documents/:docId
export const deleteVehicleDocument = async (req, res) => {
  const orgId = req.user?.orgId ?? 1;
  const vehicleId = Number(req.params.id);
  const docId = Number(req.params.docId);

  const doc = await prisma.vehicleDocument.findFirst({ where: { id: docId, orgId, vehicleId } });
  if (!doc) return res.status(404).json({ code: "NOT_FOUND", message: "Document not found" });

  await prisma.vehicleDocument.delete({ where: { id: docId } });
  return res.status(204).send();
};
