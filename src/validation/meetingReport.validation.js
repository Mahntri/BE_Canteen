import { z } from "zod";

const optionalDateString = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Ngày không hợp lệ");
    }
    return date;
  });

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),

  fromDate: optionalDateString,
  toDate: optionalDateString,

  groupBy: z.enum(["department", "organizer", "time", "meetingType"]).optional().default("time"),
  timeBucket: z.enum(["day", "week", "month"]).optional().default("day"),
  export: z.enum(["csv", "xlsx"]).optional().nullable(),

  roomId: z.string().trim().optional().nullable(),
  organizerId: z.string().trim().optional().nullable(),
  departmentId: z
    .any()
    .transform((value) => {
      if (value === "" || value === null || value === undefined) return null;
      const num = Number(value);
      return Number.isNaN(num) ? null : num;
    }),
  meetingType: z.string().trim().optional().nullable(),
  action: z.string().trim().optional().nullable(),

  building: z.string().trim().optional().nullable(),
  floor: z
    .any()
    .transform((value) => {
      if (value === "" || value === null || value === undefined) return null;
      const num = Number(value);
      return Number.isNaN(num) ? null : num;
    }),

  severity: z.string().trim().optional().nullable(),
  status: z.string().trim().optional().nullable(),
  incidentType: z.string().trim().optional().nullable(),
});

export const parseReportQuery = (query) => {
  const result = querySchema.safeParse(query);

  if (!result.success) {
    const message = result.error.issues.map((item) => {
      const path = item.path.join(".") || "query";
      return `${path}: ${item.message}`;
    }).join(", ");

    throw new Error(message || "Query không hợp lệ");
  }

  const data = result.data;

  if (data.fromDate && data.toDate && data.fromDate > data.toDate) {
    throw new Error("fromDate phải nhỏ hơn hoặc bằng toDate");
  }

  return {
    page: data.page,
    pageSize: data.pageSize,
    fromDate: data.fromDate,
    toDate: data.toDate,
    groupBy: data.groupBy,
    timeBucket: data.timeBucket,
    exportType: data.export || null,

    roomId: data.roomId || null,
    organizerId: data.organizerId || null,
    departmentId: data.departmentId,
    meetingType: data.meetingType ? String(data.meetingType).toUpperCase() : null,
    action: data.action ? String(data.action).toUpperCase() : null,

    building: data.building || null,
    floor: data.floor,

    severity: data.severity ? String(data.severity).toUpperCase() : null,
    status: data.status ? String(data.status).toUpperCase() : null,
    incidentType: data.incidentType ? String(data.incidentType).toUpperCase() : null,
  };
};