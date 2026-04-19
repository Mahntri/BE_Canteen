import XLSX from "xlsx";

const normalizeCellValue = (value) => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return value;
};

const escapeCsv = (value) => {
  const raw = String(normalizeCellValue(value));
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

export const exportCsv = (res, filename, rows = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const headers = safeRows.length > 0 ? Object.keys(safeRows[0]) : [];
  const lines = [];

  if (headers.length > 0) {
    lines.push(headers.join(","));
    for (const row of safeRows) {
      lines.push(headers.map((header) => escapeCsv(row[header])).join(","));
    }
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send("\uFEFF" + lines.join("\n"));
};

export const exportXlsx = (res, filename, sheetName, rows = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const normalizedRows = safeRows.map((row) => {
    const nextRow = {};
    Object.keys(row || {}).forEach((key) => {
      nextRow[key] = normalizeCellValue(row[key]);
    });
    return nextRow;
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(normalizedRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || "Report");

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
};