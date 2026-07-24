import ExcelJS from "exceljs";
import database from "../config/db.js";

const DEFAULT_LAYOUT = {
  serialColumnWidth: 5.78,
  dateColumnWidth: 8.66,
  employeeColumnWidth: 13.78,
  rowHeight: 28.05,
  paperSize: "A4",
};

const PAPER_SIZES = {
  A5: { excelPaperSize: 11, printableHeight: 370 },
  A4: { excelPaperSize: 9, printableHeight: 544 },
  A3: { excelPaperSize: 8, printableHeight: 791 },
  LETTER: { excelPaperSize: 1, printableHeight: 562 },
};

const MAX_EXPORT_DAYS = 366;
const MEDIUM_BLACK_BORDER = {
  style: "medium",
  color: { argb: "FF000000" },
};
const GRID_BORDER = {
  top: MEDIUM_BLACK_BORDER,
  left: MEDIUM_BLACK_BORDER,
  bottom: MEDIUM_BLACK_BORDER,
  right: MEDIUM_BLACK_BORDER,
};
const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE7E6E6" },
};
const WHITE_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFFFF" },
};
const CENTERED = {
  horizontal: "center",
  vertical: "middle",
  wrapText: true,
};
const TITLE_FONT = {
  name: "Calibri",
  size: 14,
  bold: true,
  color: { argb: "FF000000" },
};
const SHIFT_HEADER_FONT = {
  name: "Calibri",
  size: 12,
  bold: true,
  color: { argb: "FF000000" },
};
const EMPLOYEE_HEADER_FONT = {
  name: "Arial",
  size: 10,
  bold: true,
  color: { argb: "FF000000" },
};
const BODY_FONT = {
  name: "Calibri",
  size: 11,
  color: { argb: "FF000000" },
};

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number * 100) / 100));
}

function parseDateKey(value, fieldName) {
  const key = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw createHttpError(`${fieldName} phải có định dạng YYYY-MM-DD`);
  }

  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw createHttpError(`${fieldName} không hợp lệ`);
  }

  return { key, date };
}

function dateDistance(start, end) {
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function normalizePaperSize(value) {
  return PAPER_SIZES[value] ? value : DEFAULT_LAYOUT.paperSize;
}

function calculateRowsPerPage(rowHeight, paperSize) {
  const printableHeight = PAPER_SIZES[paperSize].printableHeight;
  const availableForData = printableHeight - rowHeight * 3;
  return Math.max(1, Math.floor(availableForData / rowHeight));
}

export function normalizeExportRequest(input = {}) {
  const start = parseDateKey(input.startDate, "Ngày bắt đầu");
  const end = parseDateKey(input.endDate, "Ngày kết thúc");
  if (end.date < start.date) {
    throw createHttpError("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu");
  }

  const totalDays = dateDistance(start.date, end.date);
  if (totalDays > MAX_EXPORT_DAYS) {
    throw createHttpError(`Mỗi lần chỉ có thể xuất tối đa ${MAX_EXPORT_DAYS} ngày`);
  }

  const layoutInput =
    input.layout && typeof input.layout === "object" ? input.layout : input;
  const paperSize = normalizePaperSize(layoutInput.paperSize);
  const layout = {
    serialColumnWidth: clamp(
      layoutInput.serialColumnWidth ?? layoutInput.columnWidths?.[0],
      DEFAULT_LAYOUT.serialColumnWidth,
      4,
      100,
    ),
    dateColumnWidth: clamp(
      layoutInput.dateColumnWidth ?? layoutInput.columnWidths?.[1],
      DEFAULT_LAYOUT.dateColumnWidth,
      5,
      100,
    ),
    employeeColumnWidth: clamp(
      layoutInput.employeeColumnWidth ?? layoutInput.columnWidths?.[2],
      DEFAULT_LAYOUT.employeeColumnWidth,
      8,
      100,
    ),
    rowHeight: clamp(layoutInput.rowHeight, DEFAULT_LAYOUT.rowHeight, 18, 72),
    paperSize,
  };

  return {
    startDate: start.key,
    endDate: end.key,
    startDateValue: start.date,
    endDateValue: end.date,
    totalDays,
    layout,
    rowsPerPage: calculateRowsPerPage(layout.rowHeight, paperSize),
  };
}

function normalizeRows(queryResult) {
  if (Array.isArray(queryResult) && Array.isArray(queryResult[0])) {
    return queryResult[0];
  }
  return Array.isArray(queryResult) ? queryResult : [];
}

function toDisplayName(value) {
  const name = String(value || "").trim();
  return name ? name.toLocaleUpperCase("vi-VN") : "";
}

function formatTime(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
}

function createShiftLabel(shift) {
  const name = String(shift.shift_name || "CA LÀM").trim().toLocaleUpperCase("vi-VN");
  const start = formatTime(shift.start_time);
  const end = formatTime(shift.end_time);
  return start && end ? `${name} · ${start} - ${end}` : name;
}

function createDateKeys(start, totalDays) {
  return Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function createDay(date) {
  const [year, month, day] = date.split("-").map(Number);
  const dateValue = new Date(Date.UTC(year, month - 1, day));
  const dateLabel = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;

  return {
    date,
    dayNumber: day,
    dateLabel: dateValue.getUTCDay() === 1 ? `${dateLabel}(T2)` : dateLabel,
    assignments: {},
  };
}

function createShiftGroups(shiftRows = [], scheduleRows = []) {
  const groups = new Map();
  const register = (shift) => {
    const shiftId = Number(shift.shift_id ?? shift.shiftId);
    if (!Number.isFinite(shiftId) || groups.has(shiftId)) return;
    groups.set(shiftId, {
      shiftId,
      label: createShiftLabel(shift),
      employeeColumnCount: 3,
      startTime: shift.start_time || "",
    });
  };

  shiftRows.forEach(register);
  scheduleRows.forEach(register);

  return [...groups.values()]
    .sort((a, b) => {
      const byTime = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
      return byTime || a.shiftId - b.shiftId;
    })
    .map(({ startTime, ...group }) => group);
}

export async function getPublishedSchedulesForExport(
  { startDate, endDate },
  db = database,
) {
  const result = await db.query(
    `SELECT
       s.schedule_id,
       s.employee_id,
       e.name AS employee_name,
       s.shift_id,
       sh.shift_name,
       TIME_FORMAT(sh.start_time, '%H:%i:%s') AS start_time,
       TIME_FORMAT(sh.end_time, '%H:%i:%s') AS end_time,
       DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date
     FROM schedules s
     LEFT JOIN employees e ON e.employee_id = s.employee_id
     LEFT JOIN shifts sh ON sh.shift_id = s.shift_id
     WHERE s.status = 'PUBLISHED'
       AND s.work_date BETWEEN ? AND ?
     ORDER BY s.work_date ASC, sh.start_time ASC, s.schedule_id ASC`,
    [startDate, endDate],
  );
  return normalizeRows(result);
}

export async function getShiftDefinitionsForExport(db = database) {
  const result = await db.query(
    `SELECT
       shift_id,
       shift_name,
       TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
       TIME_FORMAT(end_time, '%H:%i:%s') AS end_time
     FROM shifts
     ORDER BY start_time ASC, shift_id ASC`,
  );
  return normalizeRows(result);
}

export function createScheduleExportPreviewFromRows(
  input = {},
  scheduleRows = [],
  shiftRows = [],
) {
  const request = normalizeExportRequest(input);
  const shiftGroups = createShiftGroups(shiftRows, scheduleRows);
  const days = createDateKeys(request.startDateValue, request.totalDays).map(createDay);
  const daysByDate = new Map(days.map((day) => [day.date, day]));
  const groupsById = new Map(shiftGroups.map((group) => [group.shiftId, group]));

  days.forEach((day) => {
    shiftGroups.forEach((group) => {
      day.assignments[group.shiftId] = [];
    });
  });

  scheduleRows.forEach((row) => {
    const day = daysByDate.get(String(row.work_date || "").slice(0, 10));
    const shiftId = Number(row.shift_id);
    if (!day || !groupsById.has(shiftId)) return;
    day.assignments[shiftId].push(toDisplayName(row.employee_name));
  });

  shiftGroups.forEach((group) => {
    const maximumEmployees = days.reduce(
      (maximum, day) => Math.max(maximum, day.assignments[group.shiftId]?.length || 0),
      0,
    );
    group.employeeColumnCount = Math.max(3, maximumEmployees);
    days.forEach((day) => {
      const assignments = day.assignments[group.shiftId] || [];
      day.assignments[group.shiftId] = Array.from(
        { length: group.employeeColumnCount },
        (_, index) => assignments[index] || "",
      );
    });
  });

  return {
    startDate: request.startDate,
    endDate: request.endDate,
    layout: request.layout,
    rowsPerPage: request.rowsPerPage,
    shiftGroups,
    days,
    summary: {
      scheduledCount: scheduleRows.length,
      shiftGroupCount: shiftGroups.length,
      dayCount: days.length,
    },
  };
}

export async function buildScheduleExportPreview(input = {}, options = {}) {
  const request = normalizeExportRequest(input);
  const db = options.db || database;
  const hasProvidedRows = Array.isArray(options.rows);
  const [scheduleRows, shiftRows] = await Promise.all([
    hasProvidedRows ? options.rows : getPublishedSchedulesForExport(request, db),
    Array.isArray(options.shiftRows)
      ? options.shiftRows
      : hasProvidedRows
        ? []
        : getShiftDefinitionsForExport(db),
  ]);
  return createScheduleExportPreviewFromRows(input, scheduleRows, shiftRows);
}

function getTotalColumns(shiftGroups) {
  return 2 + shiftGroups.reduce((total, group) => total + group.employeeColumnCount, 0);
}

function getWorksheetColumns(layout, shiftGroups) {
  return [
    { width: layout.serialColumnWidth },
    { width: layout.dateColumnWidth },
    ...shiftGroups.flatMap((group) =>
      Array.from({ length: group.employeeColumnCount }, () => ({
        width: layout.employeeColumnWidth,
      })),
    ),
  ];
}

function columnName(columnNumber) {
  let number = columnNumber;
  let name = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
}

function styleCell(cell, { value, fill, font = BODY_FONT } = {}) {
  if (value !== undefined) cell.value = value;
  cell.fill = fill;
  cell.font = font;
  cell.alignment = CENTERED;
  cell.border = GRID_BORDER;
}

function styleTableGrid(worksheet, startRow, dataRowCount, layout, totalColumns) {
  for (let rowOffset = 0; rowOffset < dataRowCount + 3; rowOffset += 1) {
    const row = worksheet.getRow(startRow + rowOffset);
    row.height = layout.rowHeight;
    for (let column = 1; column <= totalColumns; column += 1) {
      styleCell(worksheet.getCell(startRow + rowOffset, column), {
        fill: rowOffset < 3 || column <= 2 ? HEADER_FILL : WHITE_FILL,
      });
    }
  }
}

function writeDataRow(worksheet, rowIndex, day, shiftGroups) {
  styleCell(worksheet.getCell(rowIndex, 1), {
    value: day.dayNumber,
    fill: HEADER_FILL,
  });
  styleCell(worksheet.getCell(rowIndex, 2), {
    value: day.dateLabel,
    fill: HEADER_FILL,
  });

  let column = 3;
  shiftGroups.forEach((group) => {
    const assignments = day.assignments[group.shiftId] || [];
    for (let index = 0; index < group.employeeColumnCount; index += 1) {
      styleCell(worksheet.getCell(rowIndex, column), {
        value: assignments[index] || "",
        fill: WHITE_FILL,
      });
      column += 1;
    }
  });
}

function writeScheduleBlock(worksheet, startRow, days, layout, shiftGroups) {
  const totalColumns = getTotalColumns(shiftGroups);
  styleTableGrid(worksheet, startRow, days.length, layout, totalColumns);

  worksheet.mergeCells(startRow, 1, startRow, totalColumns);
  styleCell(worksheet.getCell(startRow, 1), {
    value: "BẢNG PHÂN CÔNG - THEO CA",
    fill: HEADER_FILL,
    font: TITLE_FONT,
  });

  worksheet.mergeCells(startRow + 1, 1, startRow + 2, 1);
  styleCell(worksheet.getCell(startRow + 1, 1), {
    value: "STT",
    fill: HEADER_FILL,
    font: EMPLOYEE_HEADER_FONT,
  });
  worksheet.mergeCells(startRow + 1, 2, startRow + 2, 2);
  styleCell(worksheet.getCell(startRow + 1, 2), {
    value: "NGÀY",
    fill: HEADER_FILL,
    font: EMPLOYEE_HEADER_FONT,
  });

  let column = 3;
  shiftGroups.forEach((group) => {
    const endColumn = column + group.employeeColumnCount - 1;
    worksheet.mergeCells(startRow + 1, column, startRow + 1, endColumn);
    styleCell(worksheet.getCell(startRow + 1, column), {
      value: group.label,
      fill: HEADER_FILL,
      font: SHIFT_HEADER_FONT,
    });
    worksheet.mergeCells(startRow + 2, column, startRow + 2, endColumn);
    styleCell(worksheet.getCell(startRow + 2, column), {
      value: "TÊN NHÂN VIÊN",
      fill: HEADER_FILL,
      font: EMPLOYEE_HEADER_FONT,
    });
    column = endColumn + 1;
  });

  days.forEach((day, index) => {
    writeDataRow(worksheet, startRow + 3 + index, day, shiftGroups);
  });
  return startRow + 2 + days.length;
}

function splitIntoBlocks(items, blockSize) {
  const blocks = [];
  for (let index = 0; index < items.length; index += blockSize) {
    blocks.push(items.slice(index, index + blockSize));
  }
  return blocks;
}

export async function createScheduleExportWorkbook(preview) {
  if (!preview?.days?.length) {
    throw createHttpError("Không có ngày nào để xuất");
  }

  const request = normalizeExportRequest({
    startDate: preview.startDate,
    endDate: preview.endDate,
    layout: preview.layout,
  });
  const { layout, rowsPerPage } = request;
  const shiftGroups = preview.shiftGroups || [];
  const totalColumns = getTotalColumns(shiftGroups);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Qshift";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Lịch làm việc", {
    pageSetup: {
      paperSize: PAPER_SIZES[layout.paperSize].excelPaperSize,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.18,
        right: 0.18,
        top: 0.35,
        bottom: 0.35,
        header: 0.18,
        footer: 0.18,
      },
    },
    properties: { defaultRowHeight: layout.rowHeight },
  });
  worksheet.views = [{ showGridLines: false }];
  worksheet.columns = getWorksheetColumns(layout, shiftGroups);

  const blocks = splitIntoBlocks(preview.days, rowsPerPage);
  let startRow = 1;
  let lastDataRow = 1;
  blocks.forEach((days, index) => {
    lastDataRow = writeScheduleBlock(
      worksheet,
      startRow,
      days,
      layout,
      shiftGroups,
    );
    if (index < blocks.length - 1) {
      worksheet.getRow(lastDataRow).addPageBreak();
      worksheet.getRow(lastDataRow + 1).height = 14.4;
      worksheet.getRow(lastDataRow + 2).height = 15;
      startRow = lastDataRow + 3;
    }
  });

  worksheet.pageSetup.printArea = `A1:${columnName(totalColumns)}${lastDataRow}`;
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
