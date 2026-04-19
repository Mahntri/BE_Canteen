const TZ_OFFSET = "+07:00";

export const ymd = (d) => {
  return d.toISOString().slice(0, 10);
};

export const parseYmdToDateUtc = (dateStr) => {
  return new Date(`${dateStr}T00:00:00.000Z`);
};

export const addDaysUtc = (date, days) => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
};

export const buildCutoff = ({ staffBookingDeadlineTime, managerBookingDeadlineTime }, bookingDateUtc, userRole = 'EMPLOYEE', now = new Date()) => {

  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const todayYmd = vnTime.toISOString().slice(0, 10);

  const bookingYmd = ymd(bookingDateUtc);

  if (bookingYmd < todayYmd) {
    return { ok: false, reason: "PAST_DATE" };
  }

  const isToday = bookingYmd === todayYmd;

  const isManager = ['ADMIN', 'MANAGER', 'SUPERVISOR', 'CANTEEN'].includes(userRole?.toUpperCase());

  if (isToday) {
    if (!isManager) {
      return { ok: false, reason: "DEADLINE_PASSED", mode: "STAFF_CANNOT_BOOK_TODAY" };
    }

    const cutoff = new Date(`${todayYmd}T${managerBookingDeadlineTime}:00${TZ_OFFSET}`);
    return { ok: now.getTime() <= cutoff.getTime(), cutoff, mode: "MANAGER_TODAY" };
  }

  const cutoffDay = ymd(addDaysUtc(bookingDateUtc, -1));

  if (isManager) {
    const cutoff = new Date(`${bookingYmd}T${managerBookingDeadlineTime}:00${TZ_OFFSET}`);
    return { ok: now.getTime() <= cutoff.getTime(), cutoff, mode: "MANAGER_FUTURE" };
  } else {
    const cutoff = new Date(`${cutoffDay}T${staffBookingDeadlineTime}:00${TZ_OFFSET}`);
    return { ok: now.getTime() <= cutoff.getTime(), cutoff, mode: "STAFF_FUTURE" };
  }
};
