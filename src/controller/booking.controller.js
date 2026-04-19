import prisma from "../config/prisma.js";
import {
  bulkCreateBookingSchema,
  updateBookingSchema,
  historyQuerySchema,
} from "../validation/booking.validation.js";
import { buildCutoff, parseYmdToDateUtc } from "../utils/bookingDeadline.js";

async function generateBookingCode(bookingDate) {
  const dateStr = bookingDate.toISOString().slice(0, 10).replace(/-/g, '');

  const todayBookings = await prisma.bookings.findMany({
    where: {
      booking_date: bookingDate,
      code: { startsWith: `BK${dateStr}` }
    },
    select: { code: true },
    orderBy: { code: 'desc' },
    take: 1
  });

  let sequence = 1;
  if (todayBookings.length > 0) {
    const lastCode = todayBookings[0].code;
    const lastSeq = parseInt(lastCode.slice(-3));
    sequence = lastSeq + 1;
  }

  return `BK${dateStr}${String(sequence).padStart(3, '0')}`;
}

const mapBooking = (b) => ({
  id: b.id,
  bookingCode: b.code,
  bookingDate: b.booking_date?.toISOString?.().slice(0, 10),
  shiftId: b.shift_id,
  status: b.status,
  isGuestBooking: !!b.is_guest_booking,
  guest: b.is_guest_booking
    ? { name: b.guest_name, org: b.guest_org, type: b.guest_type }
    : null,
  amount: b.amount != null ? Number(b.amount) : 0,
  note: b.note,
  totalQuantity: b.totalQuantity,
  createdAt: b.created_at,
  items: (b.booking_items || []).map((it) => ({
    id: it.id,
    dishId: it.dish_id,
    quantity: it.quantity,
    unitPrice: it.unit_price != null ? Number(it.unit_price) : 0,
    dishName: it.dishes?.name ?? null,
  })),
});

const getOrgSetting = async (orgId) => {
  const setting = await prisma.organizationSetting.findUnique({
    where: { orgId },
    select: { staffBookingDeadlineTime: true, managerBookingDeadlineTime: true },
  });
  return setting ?? { staffBookingDeadlineTime: "16:00", managerBookingDeadlineTime: "09:00" };
};

const canCreateGuestBooking = (roleName) => {
  const allowedRoles = ["ADMIN", "SUPERVISOR", "CANTEEN", "MANAGER"];
  return allowedRoles.includes(roleName);
};

const fetchDishPrices = async (items) => {
  if (!items || items.length === 0) return new Map();
  const dishIds = items.map(i => i.dishId);
  const dishes = await prisma.dishes.findMany({
    where: { id: { in: dishIds } },
    select: { id: true, price: true, name: true }
  });
  return new Map(dishes.map(d => [d.id, Number(d.price)]));
};

// POST /api/v1/bookings/bulk
export const bulkCreateBookings = async (req, res) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    const orgId = req.user?.orgId ?? 1;

    if (!userId) return res.status(401).json({ code: "UNAUTHORIZED" });

    const body = bulkCreateBookingSchema.parse(req.body);

    const userWithRole = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true }
    });
    const userRole = userWithRole?.role?.name || 'EMPLOYEE';

    if (body.isGuestBooking) {
      if (!canCreateGuestBooking(userRole)) {
        return res.status(403).json({
          code: "FORBIDDEN",
          message: "Bạn không có quyền tạo suất ăn cho khách (Guest Booking)."
        });
      }

      // Check món SPECIAL cho khách
      if (body.items && body.items.length > 0) {
        const dishIds = body.items.map(i => i.dishId);
        const dishes = await prisma.dishes.findMany({
          where: { id: { in: dishIds } },
          select: { id: true, name: true, type: true }
        });

        const invalidDishes = dishes.filter(d => d.type !== 'SPECIAL');
        if (invalidDishes.length > 0) {
          return res.status(400).json({
            code: "INVALID_DISH_TYPE",
            message: "Suất khách chỉ được phép chọn món Đặc biệt (SPECIAL).",
            invalidDishes: invalidDishes.map(d => d.name)
          });
        }
      }
    }

    const priceMap = await fetchDishPrices(body.items);

    let singleDayAmount = 0;

    // Updated logic to ensure totalQuantity is correctly parsed
    let totalPortionsForAmount = 1;
    if (body.isGuestBooking && body.totalQuantity) {
      const parsedQty = parseInt(body.totalQuantity, 10);
      if (!isNaN(parsedQty) && parsedQty > 0) {
        totalPortionsForAmount = parsedQty;
      }
    }

    if (body.items) {
      for (const it of body.items) {
        const price = priceMap.get(it.dishId) || 0;
        singleDayAmount += price * it.quantity * totalPortionsForAmount;
      }
    }

    const setting = await getOrgSetting(orgId);

    const invalidDates = [];
    const dateObjs = body.dates.map((d) => ({ str: d, date: parseYmdToDateUtc(d) }));

    for (const d of dateObjs) {
      const chk = buildCutoff(setting, d.date, userRole, new Date());
      if (!chk.ok) invalidDates.push({ date: d.str, reason: chk.reason ?? "DEADLINE_PASSED", cutoff: chk.cutoff });
    }

    if (invalidDates.length) {
      return res.status(403).json({
        code: "DEADLINE_PASSED",
        message: "Bạn đã quá hạn đăng ký",
        invalidDates: invalidDates.map((x) => ({
          date: x.date,
          reason: x.reason,
          cutoff: x.cutoff ? x.cutoff.toISOString() : null,
        })),
      });
    }

    const existing = await prisma.bookings.findMany({
      where: {
        user_id: userId,
        shift_id: body.shiftId,
        booking_date: { in: dateObjs.map((x) => x.date) },
        is_guest_booking: body.isGuestBooking,
        status: { not: 'CANCELLED' }, // Cho phép đăng ký lại ngày đã hủy
        ...(body.isGuestBooking ? { guest_name: body.guest?.name ?? null } : {}),
      },
      select: { booking_date: true },
    });

    if (existing.length) {
      return res.status(409).json({
        code: "CONFLICT",
        message: "Đã tồn tại booking cho một số ngày.",
        dates: existing.map((x) => x.booking_date.toISOString().slice(0, 10)),
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const d of dateObjs) {
        let totalPortions = 1;
        if (body.isGuestBooking && body.totalQuantity) {
          const parsedQty = parseInt(body.totalQuantity, 10);
          if (!isNaN(parsedQty) && parsedQty > 0) {
            totalPortions = parsedQty;
          }
        }
        console.log(`Creating booking: Guest=${body.isGuestBooking}, TotalQtyInput=${body.totalQuantity}, Parsed=${totalPortions}`);


        const itemsCreateData = body.items?.length
          ? body.items.map((it) => ({
            dish_id: it.dishId,
            quantity: it.quantity * totalPortions,
            unit_price: priceMap.get(it.dishId) || 0,
          }))
          : [];

        const bookingCode = await generateBookingCode(d.date);

        const bookingData = {
          user_id: userId,
          code: bookingCode,
          booking_date: d.date,
          shift_id: body.shiftId,
          is_guest_booking: body.isGuestBooking,
          guest_name: body.isGuestBooking ? (body.guest?.name ?? null) : null,
          guest_org: body.isGuestBooking ? (body.guest?.org ?? null) : null,
          guest_type: body.isGuestBooking ? (body.guest?.type ?? null) : null,
          status: "CONFIRMED",
          amount: singleDayAmount,
          note: body.note || null,
          totalQuantity: totalPortions,
          booking_items: itemsCreateData.length > 0
            ? { create: itemsCreateData }
            : undefined,
        };

        const booking = await tx.bookings.create({
          data: bookingData,
          include: {
            booking_items: { include: { dishes: { select: { name: true } } } },
          },
        });
        results.push(booking);
      }
      return results;
    });

    return res.status(201).json({ data: created.map(mapBooking) });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(422).json({ code: "VALIDATION_ERROR", errors: e.errors });
    }
    console.error("bulkCreateBookings error:", e);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Server error" });
  }
};

// PATCH /api/v1/bookings/:id
export const updateBooking = async (req, res) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    const orgId = req.user?.orgId ?? 1;
    if (!userId) return res.status(401).json({ code: "UNAUTHORIZED" });

    const id = req.params.id;
    const body = updateBookingSchema.parse(req.body);

    const booking = await prisma.bookings.findUnique({
      where: { id },
      include: { booking_items: true },
    });

    if (!booking) return res.status(404).json({ code: "NOT_FOUND", message: "Booking not found" });
    if (booking.user_id !== userId) return res.status(403).json({ code: "FORBIDDEN", message: "Không có quyền sửa booking này" });

    const setting = await getOrgSetting(orgId);
    const userWithRole = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true }
    });
    const userRole = userWithRole?.role?.name || 'EMPLOYEE';

    const chk = buildCutoff(setting, booking.booking_date, userRole, new Date());
    if (!chk.ok) {
      return res.status(403).json({
        code: "DEADLINE_PASSED",
        message: "Bạn đã quá hạn đăng ký",
        cutoff: chk.cutoff ? chk.cutoff.toISOString() : null,
      });
    }

    let newAmount = Number(booking.amount);
    let itemsToCreate = [];
    let totalPortions;

    if (body.items) {
      const priceMap = await fetchDishPrices(body.items);
      // Ensure totalQuantity is properly parsed as integer
      totalPortions = 1;
      if (booking.is_guest_booking && body.totalQuantity) {
        const parsedQty = parseInt(body.totalQuantity, 10);
        if (!isNaN(parsedQty) && parsedQty > 0) {
          totalPortions = parsedQty;
        }
      }
      newAmount = 0;
      body.items.forEach(it => {
        newAmount += (priceMap.get(it.dishId) || 0) * (it.quantity * totalPortions);
      });

      itemsToCreate = body.items.map((it) => ({
        dish_id: it.dishId,
        quantity: it.quantity * totalPortions,
        unit_price: priceMap.get(it.dishId) || 0,
      }));
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (body.items) {
        await tx.booking_items.deleteMany({ where: { booking_id: booking.id } });
      }

      return tx.bookings.update({
        where: { id: booking.id },
        data: {
          amount: newAmount,
          ...(body.shiftId !== undefined ? { shift_id: body.shiftId } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
          ...(totalPortions !== undefined ? { totalQuantity: totalPortions } : {}),
          ...(body.guest
            ? {
              guest_name: body.guest.name,
              guest_org: body.guest.org ?? null,
              guest_type: body.guest.type ?? null,
              is_guest_booking: true,
            }
            : {}),
          ...(body.items?.length
            ? {
              booking_items: {
                create: itemsToCreate,
              },
            }
            : {}),
        },
        include: {
          booking_items: { include: { dishes: { select: { name: true } } } },
        },
      });
    });

    return res.json({ data: mapBooking(updated) });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(422).json({ code: "VALIDATION_ERROR", errors: e.errors });
    }
    console.error("updateBooking error:", e);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Server error" });
  }
};

// PATCH /api/v1/bookings/:id/cancel
export const cancelBooking = async (req, res) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    const orgId = req.user?.orgId ?? 1;
    if (!userId) return res.status(401).json({ code: "UNAUTHORIZED" });

    const id = req.params.id;

    const booking = await prisma.bookings.findUnique({ where: { id } });
    if (!booking) return res.status(404).json({ code: "NOT_FOUND", message: "Booking not found" });
    if (booking.user_id !== userId) return res.status(403).json({ code: "FORBIDDEN", message: "Không có quyền hủy booking này" });

    const setting = await getOrgSetting(orgId);
    const userWithRole = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true }
    });
    const userRole = userWithRole?.role?.name || 'EMPLOYEE';

    const chk = buildCutoff(setting, booking.booking_date, userRole, new Date());
    if (!chk.ok) {
      return res.status(403).json({
        code: "DEADLINE_PASSED",
        message: "Bạn đã quá hạn đăng ký",
        cutoff: chk.cutoff ? chk.cutoff.toISOString() : null,
      });
    }

    const updateData = {
      status: "CANCELLED"
    };

    if (booking.is_guest_booking && booking.guest_name) {
      // Xóa suffix "(đã hủy...)" cũ nếu có, để tránh trùng lặp
      const baseName = booking.guest_name.replace(/\s*\(đã hủy.*\)$/i, '');
      // Thêm timestamp để đảm bảo guest_name unique mỗi lần hủy
      const timestamp = new Date().getTime();
      updateData.guest_name = `${baseName} (đã hủy ${timestamp})`;
    }

    const updated = await prisma.bookings.update({
      where: { id },
      data: updateData,
      include: {
        booking_items: { include: { dishes: { select: { name: true } } } },
      },
    });

    return res.json({ data: mapBooking(updated) });
  } catch (e) {
    console.error("cancelBooking error:", e);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Server error" });
  }
};

// GET /api/v1/bookings/history
export const getMyBookingHistory = async (req, res) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) return res.status(401).json({ code: "UNAUTHORIZED" });

    const { from, to, status, type, page, limit } = historyQuerySchema.parse(req.query);
    const skip = (page - 1) * limit;

    const where = {
      user_id: userId,
      ...(status ? { status } : {}),
      ...(type ? { is_guest_booking: type === "guest" } : {}),
      ...(from || to
        ? {
          booking_date: {
            ...(from ? { gte: parseYmdToDateUtc(from) } : {}),
            ...(to ? { lte: parseYmdToDateUtc(to) } : {}),
          },
        }
        : {}),
    };

    const [total, data] = await Promise.all([
      prisma.bookings.count({ where }),
      prisma.bookings.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ booking_date: "desc" }, { created_at: "desc" }],
        include: {
          booking_items: { include: { dishes: { select: { name: true } } } },
          shifts: { select: { id: true, name: true, start_time: true, end_time: true } },
        },
      }),
    ]);

    return res.json({
      data: data.map(mapBooking),
      meta: { page, limit, total },
    });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(422).json({ code: "VALIDATION_ERROR", errors: e.errors });
    }
    console.error("getMyBookingHistory error:", e);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Server error" });
  }
};

export default {
  bulkCreateBookings,
  updateBooking,
  cancelBooking,
  getMyBookingHistory
};