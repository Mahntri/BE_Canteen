import prisma from "../config/prisma.js";
import { parseReportQuery } from "../validation/meetingReport.validation.js";
import { exportCsv, exportXlsx } from "../utils/reportExport.js";

const DEFAULT_FROM = new Date("2000-01-01T00:00:00.000Z");
const DEFAULT_TO = new Date("2099-12-31T23:59:59.999Z");
const WORK_HOURS_PER_DAY = 10;

const createBinder = () => {
  const values = [];
  return {
    bind(value) {
      values.push(value);
      return `$${values.length}`;
    },
    values,
  };
};

const getDateRange = (query) => {
  return {
    fromDate: query.fromDate || DEFAULT_FROM,
    toDate: query.toDate || DEFAULT_TO,
  };
};

const getBusinessDays = (fromDate, toDate) => {
  const start = new Date(fromDate);
  const end = new Date(toDate);

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  let count = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
};

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
};

const getBookingHistoryData = async (query) => {
  const { fromDate, toDate } = getDateRange(query);
  const page = query.page || 1;
  const pageSize = query.pageSize || 20;
  const offset = (page - 1) * pageSize;

  const binder = createBinder();
  let where = "WHERE 1=1";

  where += ` AND al.timestamp >= ${binder.bind(fromDate)}`;
  where += ` AND al.timestamp <= ${binder.bind(toDate)}`;

  if (query.action) {
    where += ` AND al.action = ${binder.bind(query.action)}`;
  }

  if (query.organizerId) {
    where += ` AND b.organizer_id = ${binder.bind(query.organizerId)}`;
  }

  if (query.departmentId !== null && query.departmentId !== undefined) {
    where += ` AND organizer.department_id = ${binder.bind(query.departmentId)}`;
  }

  if (query.meetingType) {
    // b.meeting_type not in schema, ignoring
  }

  if (query.roomId) {
    where += ` AND EXISTS (
      SELECT 1
      FROM meeting_booking_rooms br2
      WHERE br2.booking_id = b.id
        AND br2.room_id = ${binder.bind(query.roomId)}
    )`;
  }

  if (query.building) {
    where += ` AND EXISTS (
      SELECT 1
      FROM meeting_booking_rooms br2
      JOIN meeting_rooms r2 ON r2.id = br2.room_id
      WHERE br2.booking_id = b.id
        AND r2.building = ${binder.bind(query.building)}
    )`;
  }

  if (query.floor !== null && query.floor !== undefined) {
    where += ` AND EXISTS (
      SELECT 1
      FROM meeting_booking_rooms br2
      JOIN meeting_rooms r2 ON r2.id = br2.room_id
      WHERE br2.booking_id = b.id
        AND r2.floor = ${binder.bind(query.floor)}
    )`;
  }

  const countSql = `
    SELECT COUNT(DISTINCT al.id)::int AS total
    FROM meeting_booking_audit_logs al
    LEFT JOIN meeting_bookings b ON b.id = al.booking_id
    LEFT JOIN users organizer ON organizer.id = b.organizer_id
    ${where}
  `;

  const countRows = await prisma.$queryRawUnsafe(countSql, ...binder.values);
  const total = Number(countRows?.[0]?.total || 0);

  const limitParam = binder.bind(pageSize);
  const offsetParam = binder.bind(offset);

  const dataSql = `
    SELECT
      al.id,
      al.booking_id AS "bookingId",
      b.title AS "meetingTitle",
      al.action AS "action",
      al.timestamp AS "actionTime",
      al.actor_id AS "actorId",
      actor.full_name AS "actorName",
      b.organizer_id AS "organizerId",
      organizer.full_name AS "organizerName",
      organizer.department_id AS "departmentId",
      dept.name AS "departmentName",
      NULL AS "meetingType",
      COALESCE(
        ARRAY_AGG(DISTINCT r.room_name) FILTER (WHERE r.room_name IS NOT NULL),
        '{}'
      ) AS "rooms",
      al.old_status AS "oldValue",
      al.new_status AS "newValue",
      NULL AS "note"
    FROM meeting_booking_audit_logs al
    LEFT JOIN meeting_bookings b ON b.id = al.booking_id
    LEFT JOIN users actor ON actor.id = al.actor_id
    LEFT JOIN users organizer ON organizer.id = b.organizer_id
    LEFT JOIN departments dept ON dept.id = organizer.department_id
    LEFT JOIN meeting_booking_rooms br ON br.booking_id = b.id
    LEFT JOIN meeting_rooms r ON r.id = br.room_id
    ${where}
    GROUP BY
      al.id,
      al.booking_id,
      b.title,
      al.action,
      al.timestamp,
      al.actor_id,
      actor.full_name,
      b.organizer_id,
      organizer.full_name,
      organizer.department_id,
      dept.name,
      al.old_status,
      al.new_status
    ORDER BY al.timestamp DESC
    LIMIT ${limitParam}
    OFFSET ${offsetParam}
  `;

  const rows = await prisma.$queryRawUnsafe(dataSql, ...binder.values);

  return {
    rows,
    pagination: {
      page,
      pageSize,
      total,
    },
  };
};

const getMeetingRoomUsageData = async (query) => {
  const { fromDate, toDate } = getDateRange(query);
  const binder = createBinder();

  const fromParam = binder.bind(fromDate);
  const toParam = binder.bind(toDate);

  let where = `
    WHERE b.status IN ('APPROVED', 'COMPLETED')
      AND b.end_time > ${fromParam}
      AND b.start_time < ${toParam}
  `;

  if (query.organizerId) {
    where += ` AND b.organizer_id = ${binder.bind(query.organizerId)}`;
  }

  // We add organizer join unconditionally in from clause to be safe
  const organizerJoin = `LEFT JOIN users organizer ON organizer.id = b.organizer_id`;

  if (query.departmentId !== null && query.departmentId !== undefined) {
    where += ` AND organizer.department_id = ${binder.bind(query.departmentId)}`;
  }

  if (query.meetingType) {
    // schema does not support meeting_type, ignoring
  }

  if (query.roomId) {
    where += ` AND EXISTS (
      SELECT 1
      FROM meeting_booking_rooms br2
      WHERE br2.booking_id = b.id
        AND br2.room_id = ${binder.bind(query.roomId)}
    )`;
  }

  if (query.building) {
    where += ` AND EXISTS (
      SELECT 1
      FROM meeting_booking_rooms br2
      JOIN meeting_rooms r2 ON r2.id = br2.room_id
      WHERE br2.booking_id = b.id
        AND r2.building = ${binder.bind(query.building)}
    )`;
  }

  if (query.floor !== null && query.floor !== undefined) {
    where += ` AND EXISTS (
      SELECT 1
      FROM meeting_booking_rooms br2
      JOIN meeting_rooms r2 ON r2.id = br2.room_id
      WHERE br2.booking_id = b.id
        AND r2.floor = ${binder.bind(query.floor)}
    )`;
  }

  const usedHoursExpr = `
    ROUND(
      COALESCE(
        SUM(
          GREATEST(
            EXTRACT(EPOCH FROM (LEAST(b.end_time, ${toParam}) - GREATEST(b.start_time, ${fromParam}))) / 3600.0,
            0
          )
        ),
        0
      )::numeric,
      2
    )
  `;

  if (query.groupBy === "department") {
    const sql = `
      SELECT
        COALESCE(dept.id::text, 'UNKNOWN') AS "key",
        COALESCE(dept.name, 'Chưa gán đơn vị') AS "label",
        COUNT(DISTINCT b.id)::int AS "bookingCount",
        ${usedHoursExpr} AS "usedHours"
      FROM meeting_bookings b
      ${organizerJoin}
      LEFT JOIN departments dept ON dept.id = organizer.department_id
      ${where}
      GROUP BY dept.id, dept.name
      ORDER BY "usedHours" DESC, "bookingCount" DESC
    `;
    const rows = await prisma.$queryRawUnsafe(sql, ...binder.values);
    return rows.map((item) => ({
      ...item,
      bookingCount: toNumber(item.bookingCount),
      usedHours: toNumber(item.usedHours),
    }));
  }

  if (query.groupBy === "organizer") {
    const sql = `
      SELECT
        organizer.id::text AS "key",
        organizer.full_name AS "label",
        COUNT(DISTINCT b.id)::int AS "bookingCount",
        ${usedHoursExpr} AS "usedHours"
      FROM meeting_bookings b
      ${organizerJoin}
      ${where}
      GROUP BY organizer.id, organizer.full_name
      ORDER BY "usedHours" DESC, "bookingCount" DESC
    `;
    const rows = await prisma.$queryRawUnsafe(sql, ...binder.values);
    return rows.map((item) => ({
      ...item,
      bookingCount: toNumber(item.bookingCount),
      usedHours: toNumber(item.usedHours),
    }));
  }

  if (query.groupBy === "meetingType") {
    const sql = `
      SELECT
        'UNKNOWN' AS "key",
        'Chưa xác định' AS "label",
        COUNT(DISTINCT b.id)::int AS "bookingCount",
        ${usedHoursExpr} AS "usedHours"
      FROM meeting_bookings b
      ${organizerJoin}
      ${where}
      ORDER BY "usedHours" DESC, "bookingCount" DESC
    `;
    const rows = await prisma.$queryRawUnsafe(sql, ...binder.values);
    return rows.map((item) => ({
      ...item,
      bookingCount: toNumber(item.bookingCount),
      usedHours: toNumber(item.usedHours),
    }));
  }

  const bucket =
    query.timeBucket === "month"
      ? "month"
      : query.timeBucket === "week"
        ? "week"
        : "day";

  const bucketFormat =
    bucket === "month"
      ? "YYYY-MM"
      : bucket === "week"
        ? 'IYYY-"W"IW'
        : "YYYY-MM-DD";

  const sql = `
    SELECT
      TO_CHAR(DATE_TRUNC('${bucket}', b.start_time), '${bucketFormat}') AS "key",
      TO_CHAR(DATE_TRUNC('${bucket}', b.start_time), '${bucketFormat}') AS "label",
      COUNT(DISTINCT b.id)::int AS "bookingCount",
      ${usedHoursExpr} AS "usedHours"
    FROM meeting_bookings b
    ${organizerJoin}
    ${where}
    GROUP BY DATE_TRUNC('${bucket}', b.start_time)
    ORDER BY DATE_TRUNC('${bucket}', b.start_time) ASC
  `;

  const rows = await prisma.$queryRawUnsafe(sql, ...binder.values);
  return rows.map((item) => ({
    ...item,
    bookingCount: toNumber(item.bookingCount),
    usedHours: toNumber(item.usedHours),
  }));
};

const getMeetingRoomUtilizationData = async (query) => {
  const { fromDate, toDate } = getDateRange(query);

  const roomBinder = createBinder();
  let roomWhere = "WHERE 1=1";

  if (query.roomId) {
    roomWhere += ` AND r.id = ${roomBinder.bind(query.roomId)}`;
  }

  if (query.building) {
    roomWhere += ` AND r.building = ${roomBinder.bind(query.building)}`;
  }

  if (query.floor !== null && query.floor !== undefined) {
    roomWhere += ` AND r.floor = ${roomBinder.bind(query.floor)}`;
  }

  const roomSql = `
    SELECT
      r.id,
      r.room_name AS "roomName",
      r.room_code AS "roomCode",
      r.building,
      r.floor,
      r.capacity,
      r.status
    FROM meeting_rooms r
    ${roomWhere}
    ORDER BY r.building ASC NULLS LAST, r.floor ASC NULLS LAST, r.room_name ASC
  `;

  const rooms = await prisma.$queryRawUnsafe(roomSql, ...roomBinder.values);

  if (!rooms.length) {
    return {
      data: [],
      summary: {
        totalUsedHours: 0,
        totalAvailableHours: 0,
        averageUtilizationRate: 0,
      },
    };
  }

  const usageBinder = createBinder();
  const fromParam = usageBinder.bind(fromDate);
  const toParam = usageBinder.bind(toDate);

  let usageWhere = `
    WHERE b.status IN ('APPROVED', 'COMPLETED')
      AND b.end_time > ${fromParam}
      AND b.start_time < ${toParam}
  `;

  if (query.roomId) {
    usageWhere += ` AND r.id = ${usageBinder.bind(query.roomId)}`;
  }

  if (query.building) {
    usageWhere += ` AND r.building = ${usageBinder.bind(query.building)}`;
  }

  if (query.floor !== null && query.floor !== undefined) {
    usageWhere += ` AND r.floor = ${usageBinder.bind(query.floor)}`;
  }

  const usageSql = `
    SELECT
      br.room_id AS "roomId",
      ROUND(
        COALESCE(
          SUM(
            GREATEST(
              EXTRACT(EPOCH FROM (LEAST(b.end_time, ${toParam}) - GREATEST(b.start_time, ${fromParam}))) / 3600.0,
              0
            )
          ),
          0
        )::numeric,
        2
      ) AS "usedHours"
    FROM meeting_booking_rooms br
    JOIN meeting_bookings b ON b.id = br.booking_id
    JOIN meeting_rooms r ON r.id = br.room_id
    ${usageWhere}
    GROUP BY br.room_id
  `;

  const usageRows = await prisma.$queryRawUnsafe(usageSql, ...usageBinder.values);
  const usageMap = new Map(usageRows.map((item) => [item.roomId, toNumber(item.usedHours)]));

  const businessDays = getBusinessDays(fromDate, toDate);
  const availableHoursPerRoom = Number((businessDays * WORK_HOURS_PER_DAY).toFixed(2));

  const data = rooms.map((room) => {
    const usedHours = usageMap.get(room.id) || 0;
    const availableHours = availableHoursPerRoom;
    const utilizationRate =
      availableHours > 0
        ? Number(((usedHours / availableHours) * 100).toFixed(2))
        : 0;

    return {
      roomId: room.id,
      roomCode: room.roomCode,
      roomName: room.roomName,
      building: room.building,
      floor: room.floor,
      capacity: room.capacity,
      status: room.status,
      usedHours,
      availableHours,
      utilizationRate,
    };
  });

  const totalUsedHours = Number(
    data.reduce((sum, item) => sum + toNumber(item.usedHours), 0).toFixed(2)
  );
  const totalAvailableHours = Number(
    data.reduce((sum, item) => sum + toNumber(item.availableHours), 0).toFixed(2)
  );

  return {
    data,
    summary: {
      totalUsedHours,
      totalAvailableHours,
      averageUtilizationRate:
        totalAvailableHours > 0
          ? Number(((totalUsedHours / totalAvailableHours) * 100).toFixed(2))
          : 0,
    },
    formula: {
      usedHours: "Tổng giờ sử dụng thực tế của phòng trong kỳ",
      availableHours: `Số ngày làm việc trong kỳ * ${WORK_HOURS_PER_DAY} giờ/ngày`,
      utilizationRate: "usedHours / availableHours * 100",
      note: "Phiên bản V1 chưa trừ lịch sử bảo trì/ngừng khai thác theo từng khoảng thời gian",
    },
  };
};

const getMeetingRoomIncidentsData = async (query) => {
  const { fromDate, toDate } = getDateRange(query);
  const binder = createBinder();

  let where = "WHERE 1=1";
  where += ` AND mi.occurred_at >= ${binder.bind(fromDate)}`;
  where += ` AND mi.occurred_at <= ${binder.bind(toDate)}`;

  if (query.roomId) {
    where += ` AND mi.room_id = ${binder.bind(query.roomId)}`;
  }

  if (query.severity) {
    where += ` AND mi.severity = ${binder.bind(query.severity)}`;
  }

  if (query.status) {
    where += ` AND mi.status = ${binder.bind(query.status)}`;
  }

  if (query.incidentType) {
    where += ` AND mi.incident_type = ${binder.bind(query.incidentType)}`;
  }

  if (query.building) {
    where += ` AND r.building = ${binder.bind(query.building)}`;
  }

  if (query.floor !== null && query.floor !== undefined) {
    where += ` AND r.floor = ${binder.bind(query.floor)}`;
  }

  const sql = `
    SELECT
      mi.id,
      mi.room_id AS "roomId",
      r.room_code AS "roomCode",
      r.room_name AS "roomName",
      r.building,
      r.floor,
      mi.booking_id AS "bookingId",
      b.title AS "meetingTitle",
      mi.title,
      mi.description,
      mi.incident_type AS "incidentType",
      mi.severity,
      mi.status,
      mi.reported_by AS "reportedBy",
      reporter.full_name AS "reportedByName",
      mi.handled_by AS "handledBy",
      handler.full_name AS "handledByName",
      mi.occurred_at AS "occurredAt",
      mi.resolved_at AS "resolvedAt",
      CASE
        WHEN mi.resolved_at IS NOT NULL
          THEN ROUND((EXTRACT(EPOCH FROM (mi.resolved_at - mi.occurred_at)) / 3600.0)::numeric, 2)
        ELSE NULL
      END AS "downtimeHours",
      mi.created_at AS "createdAt",
      mi.updated_at AS "updatedAt"
    FROM meeting_incidents mi
    LEFT JOIN meeting_rooms r ON r.id = mi.room_id
    LEFT JOIN meeting_bookings b ON b.id = mi.booking_id
    LEFT JOIN users reporter ON reporter.id = mi.reported_by
    LEFT JOIN users handler ON handler.id = mi.handled_by
    ${where}
    ORDER BY mi.occurred_at DESC
  `;

  const rows = await prisma.$queryRawUnsafe(sql, ...binder.values);

  return rows.map((item) => ({
    ...item,
    downtimeHours: item.downtimeHours !== null ? toNumber(item.downtimeHours) : null,
  }));
};

export const getBookingHistory = async (req, res) => {
  try {
    const query = parseReportQuery(req.query);
    const result = await getBookingHistoryData(query);

    if (query.exportType === "csv") {
      return exportCsv(res, "meeting-booking-history.csv", result.rows);
    }

    if (query.exportType === "xlsx") {
      return exportXlsx(res, "meeting-booking-history.xlsx", "History", result.rows);
    }

    return res.json({
      success: true,
      data: result.rows,
      pagination: result.pagination,
    });
  } catch (e) {
    console.error("DEBUG ERROR in getBookingHistory:", e);
    return res.status(400).json({ success: false, message: e.message });
  }
};

export const getMeetingRoomUsageReport = async (req, res) => {
  try {
    const query = parseReportQuery(req.query);
    const rows = await getMeetingRoomUsageData(query);

    if (query.exportType === "csv") {
      return exportCsv(res, "meeting-room-usage.csv", rows);
    }

    if (query.exportType === "xlsx") {
      return exportXlsx(res, "meeting-room-usage.xlsx", "Usage", rows);
    }

    return res.json({
      success: true,
      data: rows,
      formula: {
        bookingCount: "Số lượng booking hợp lệ trong kỳ",
        usedHours: "Tổng số giờ booking hợp lệ trong kỳ",
        validStatuses: ["APPROVED", "COMPLETED"],
      },
    });
  } catch (e) {
    console.error("DEBUG ERROR in getMeetingRoomUsageReport:", e);
    return res.status(400).json({ success: false, message: e.message });
  }
};

export const getMeetingRoomUtilizationReport = async (req, res) => {
  try {
    const query = parseReportQuery(req.query);
    const result = await getMeetingRoomUtilizationData(query);

    if (query.exportType === "csv") {
      return exportCsv(res, "meeting-room-utilization.csv", result.data);
    }

    if (query.exportType === "xlsx") {
      return exportXlsx(res, "meeting-room-utilization.xlsx", "Utilization", result.data);
    }

    return res.json({
      success: true,
      ...result,
    });
  } catch (e) {
    console.error("DEBUG ERROR in getMeetingRoomUtilizationReport:", e);
    return res.status(400).json({ success: false, message: e.message });
  }
};

export const getMeetingRoomIncidentsReport = async (req, res) => {
  try {
    const query = parseReportQuery(req.query);
    const rows = await getMeetingRoomIncidentsData(query);

    if (query.exportType === "csv") {
      return exportCsv(res, "meeting-room-incidents.csv", rows);
    }

    if (query.exportType === "xlsx") {
      return exportXlsx(res, "meeting-room-incidents.xlsx", "Incidents", rows);
    }

    return res.json({
      success: true,
      data: rows,
      formula: {
        downtimeHours: "resolvedAt - occurredAt (đơn vị giờ)",
      },
    });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
};