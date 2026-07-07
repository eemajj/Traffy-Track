import ExcelJS from "exceljs";
import path from "node:path";

import type { ReportDepartmentExportData } from "@/lib/report";

type ReadyExportData = Extract<ReportDepartmentExportData, { status: "ready" }>;

export function sanitizeFilenameSegment(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getTextLength(value: string | null | undefined) {
  return (value || "").trim().length;
}

function getReportRowHeight(ticket: ReadyExportData["tickets"][number]) {
  const longestOperationalText = Math.max(
    getTextLength(ticket.comment),
    getTextLength(ticket.address),
    getTextLength(ticket.org_response)
  );
  const extraLines = Math.ceil(longestOperationalText / 64);

  return Math.min(Math.max(78, 58 + extraLines * 18), 132);
}

function applyPrintableLayout(worksheet: ExcelJS.Worksheet, lastRowNumber: number) {
  const columnWidths: Record<number, number> = {
    1: 14,
    2: 17,
    3: 38,
    4: 28,
    5: 13,
    6: 18,
    7: 18,
    8: 16,
    9: 30,
    10: 44,
    11: 22,
    12: 30
  };

  for (const [columnNumber, width] of Object.entries(columnWidths)) {
    worksheet.getColumn(Number(columnNumber)).width = width;
  }

  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.pageSetup = {
    ...worksheet.pageSetup,
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printTitlesRow: "1:1",
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.35,
      header: 0.15,
      footer: 0.2
    }
  };
  worksheet.pageSetup.printArea = `A1:L${Math.max(lastRowNumber, 1)}`;
  worksheet.headerFooter = worksheet.headerFooter || {};
  worksheet.headerFooter.oddFooter = "&Lรายงาน Traffy Fondue&C&F&Rหน้า &P / &N";
}

export function buildReportDepartmentExcelFilename(exportData: ReadyExportData) {
  const fileDate = exportData.batch.report_date;
  const fileDept = sanitizeFilenameSegment(exportData.department.dept_name);
  return `report-${fileDate}-${fileDept}.xlsx`;
}

export async function buildReportDepartmentWorkbookBuffer(exportData: ReadyExportData) {
  const workbook = new ExcelJS.Workbook();
  const templatePath = path.join(process.cwd(), "formTF.xlsx");
  await workbook.xlsx.readFile(templatePath);

  const worksheet = workbook.worksheets[0];
  worksheet.name = sanitizeFilenameSegment(exportData.department.dept_name).slice(0, 31) || "รายงาน";
  applyPrintableLayout(worksheet, exportData.tickets.length + 1);

  const headerRow = worksheet.getRow(1);
  headerRow.height = Math.max(headerRow.height || 0, 54);

  for (let col = 1; col <= 12; col += 1) {
    const cell = headerRow.getCell(col);
    cell.font = {
      name: "Tahoma",
      size: 10,
      bold: true
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" }
    };
  }

  exportData.tickets.forEach((ticket, index) => {
    const rowNumber = index + 2;
    const row = worksheet.getRow(rowNumber);
    row.height = getReportRowHeight(ticket);

    row.getCell(1).value = ticket.ticket_id;
    row.getCell(2).value = ticket.type || "";
    row.getCell(3).value = ticket.comment || "";
    row.getCell(4).value = ticket.address || "";
    row.getCell(5).value = ticket.subdistrict || "";
    row.getCell(6).value = formatDateTime(ticket.timestamp);
    row.getCell(7).value = formatDateTime(ticket.last_activity);
    row.getCell(8).value = ticket.state || "";
    row.getCell(9).value = ticket.org_response || "";
    row.getCell(10).value = "";
    row.getCell(11).value = "";
    row.getCell(12).value = "";

    for (let col = 1; col <= 12; col += 1) {
      const cell = row.getCell(col);
      cell.font = {
        name: "Tahoma",
        size: col >= 10 ? 12 : 10
      };
      cell.alignment = {
        horizontal: col === 10 || col === 12 ? "left" : "center",
        vertical: "top",
        wrapText: true
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" }
      };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
}
