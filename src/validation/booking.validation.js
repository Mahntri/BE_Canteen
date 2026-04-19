import { z } from "zod";

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

export const bulkCreateBookingSchema = z.object({
  dates: z.array(z.string().regex(ymdRegex)).min(1),
  shiftId: z.coerce.number().int().positive(),
  isGuestBooking: z.coerce.boolean().optional().default(false),

  guest: z.object({
    name: z.string().min(1),
    org: z.string().optional(),
    type: z.enum(["internal", "partner", "visitor"]).optional(),
  }).optional(),

  items: z.array(z.object({
    dishId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive().default(1),
    unitPrice: z.coerce.number().nonnegative().optional(),
  })).optional(),

  note: z.string().optional(),
  totalQuantity: z.coerce.number().int().positive().optional(),
}).superRefine((val, ctx) => {
  if (val.isGuestBooking) {
    if (!val.guest?.name) ctx.addIssue({ code: "custom", path: ["guest", "name"], message: "guest.name là bắt buộc" });
    // if (!val.items?.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Suất khách phải có items" });
  }
});

export const updateBookingSchema = z.object({
  shiftId: z.coerce.number().int().positive().optional(),
  guest: z.object({
    name: z.string().min(1),
    org: z.string().optional(),
    type: z.enum(["internal", "partner", "visitor"]).optional(),
  }).optional(),
  items: z.array(z.object({
    dishId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive().default(1),
    unitPrice: z.coerce.number().nonnegative().optional(),
  })).optional(),
  note: z.string().optional(),
  totalQuantity: z.number().int().positive().optional(),
});

export const historyQuerySchema = z.object({
  from: z.string().regex(ymdRegex).optional(),
  to: z.string().regex(ymdRegex).optional(),
  status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED", "REJECTED"]).optional(),
  type: z.enum(["regular", "guest"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(10000).default(20),
});
