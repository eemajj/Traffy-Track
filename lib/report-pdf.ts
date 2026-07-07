import fs from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit/js/pdfkit.standalone";

import type { ReportDepartmentExportData } from "@/lib/report";
import { sanitizeFilenameSegment } from "@/lib/report-excel";

type ReadyExportData = Extract<ReportDepartmentExportData, { status: "ready" }>;

type PdfTableColumn = {
  key: string;
  label: string;
  width: number;
  align?: "left" | "center";
};

const PAGE_MARGIN = 24;
const TABLE_TOP_MARGIN = 104;
const TABLE_BOTTOM_MARGIN = 42;
const HEADER_ROW_HEIGHT = 30;
const MIN_ROW_HEIGHT = 56;
const MAX_ROW_HEIGHT = 118;
const CELL_PADDING = 4;

const columns: PdfTableColumn[] = [
  { key: "index", label: "ลำดับ", width: 28, align: "center" },
  { key: "ticket_id", label: "รหัสเรื่อง", width: 58, align: "center" },
  { key: "type", label: "ประเภท", width: 52 },
  { key: "comment", label: "รายละเอียดเรื่อง", width: 142 },
  { key: "address", label: "สถานที่", width: 94 },
  { key: "last_activity", label: "อัปเดตล่าสุด", width: 58, align: "center" },
  { key: "state", label: "สถานะ", width: 52, align: "center" },
  { key: "result", label: "ผลดำเนินการ", width: 154 },
  { key: "signature", label: "เซ็นชื่อ", width: 74 },
  { key: "note", label: "หมายเหตุ", width: 80 }
];

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function getThaiFontPath() {
  const candidates = [
    path.join(process.cwd(), "public", "fonts", "tahoma.ttf"),
    path.join(process.cwd(), "public", "fonts", "Tahoma.ttf"),
    path.join(process.cwd(), "public", "fonts", "NotoSansThai-Regular.ttf"),
    path.join(process.cwd(), "public", "fonts", "NotoSansThai-Regular.woff"),
    "/System/Library/Fonts/Supplemental/Tahoma.ttf",
    "/Library/Fonts/Tahoma.ttf"
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function getThaiBoldFontPath() {
  const candidates = [
    path.join(process.cwd(), "public", "fonts", "tahomabd.ttf"),
    path.join(process.cwd(), "public", "fonts", "Tahoma Bold.ttf"),
    path.join(process.cwd(), "public", "fonts", "NotoSansThai-Bold.ttf"),
    path.join(process.cwd(), "public", "fonts", "NotoSansThai-Bold.woff"),
    "/System/Library/Fonts/Supplemental/Tahoma Bold.ttf",
    "/Library/Fonts/Tahoma Bold.ttf"
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || getThaiFontPath();
}

function addText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { size?: number; bold?: boolean; align?: "left" | "center" | "right"; color?: string } = {}
) {
  doc
    .font(options.bold ? "ThaiBold" : "Thai")
    .fontSize(options.size || 8)
    .fillColor(options.color || "#162033")
    .text(text || "-", x, y, {
      width,
      height,
      align: options.align || "left",
      lineGap: 1,
      ellipsis: true
    });
}

function getRowHeight(doc: PDFKit.PDFDocument, row: Record<string, string>) {
  let contentHeight = MIN_ROW_HEIGHT;

  for (const column of columns) {
    const text = row[column.key] || "";
    const measured = doc.heightOfString(text, {
      width: column.width - CELL_PADDING * 2,
      lineGap: 1
    });
    contentHeight = Math.max(contentHeight, measured + CELL_PADDING * 2);
  }

  return Math.min(contentHeight, MAX_ROW_HEIGHT);
}

function drawReportHeader(doc: PDFKit.PDFDocument, exportData: ReadyExportData) {
  doc.rect(PAGE_MARGIN, 18, doc.page.width - PAGE_MARGIN * 2, 58).fill("#eef3f8");
  addText(doc, "รายงานติดตามเรื่องร้องเรียน Traffy Fondue เขตทวีวัฒนา", PAGE_MARGIN + 12, 28, 360, 20, {
    size: 13,
    bold: true
  });
  addText(doc, `ฝ่าย: ${exportData.department.dept_name}`, PAGE_MARGIN + 12, 50, 360, 18, {
    size: 9
  });
  addText(doc, `รอบรายงาน: ${formatDate(exportData.batch.report_date)}`, 520, 28, 140, 18, {
    size: 9
  });
  addText(doc, `จำนวนเรื่อง: ${exportData.tickets.length}`, 520, 48, 110, 18, {
    size: 9
  });
  addText(doc, `วันที่พิมพ์: ${formatDate(new Date().toISOString())}`, 646, 48, 150, 18, {
    size: 9
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number) {
  let x = PAGE_MARGIN;

  doc.font("ThaiBold").fontSize(8);

  for (const column of columns) {
    doc.rect(x, y, column.width, HEADER_ROW_HEIGHT).fillAndStroke("#e2eaf3", "#7d8da6");
    addText(doc, column.label, x + CELL_PADDING, y + 7, column.width - CELL_PADDING * 2, HEADER_ROW_HEIGHT - 10, {
      size: 8,
      bold: true,
      align: "center"
    });
    x += column.width;
  }
}

function drawRow(doc: PDFKit.PDFDocument, row: Record<string, string>, y: number, height: number) {
  let x = PAGE_MARGIN;

  for (const column of columns) {
    doc.rect(x, y, column.width, height).stroke("#7d8da6");
    addText(doc, row[column.key] || "", x + CELL_PADDING, y + CELL_PADDING, column.width - CELL_PADDING * 2, height - CELL_PADDING * 2, {
      size: 7.4,
      align: column.align || "left"
    });
    x += column.width;
  }
}

function addPageFooter(doc: PDFKit.PDFDocument, pageIndex: number, pageCount: number) {
  doc.switchToPage(pageIndex);
  addText(
    doc,
    `หน้า ${pageIndex + 1} / ${pageCount}`,
    doc.page.width - PAGE_MARGIN - 90,
    doc.page.height - 25,
    90,
    14,
    { size: 8, align: "right", color: "#5b6b84" }
  );
}

function buildRow(ticket: ReadyExportData["tickets"][number], index: number): Record<string, string> {
  return {
    index: String(index + 1),
    ticket_id: ticket.ticket_id,
    type: ticket.type || "-",
    comment: ticket.comment || "-",
    address: [ticket.address, ticket.subdistrict].filter(Boolean).join(" ") || "-",
    last_activity: formatDateTime(ticket.last_activity),
    state: ticket.state || "-",
    result: "",
    signature: "",
    note: ""
  };
}

export function buildReportDepartmentPdfFilename(exportData: ReadyExportData) {
  const fileDate = exportData.batch.report_date;
  const fileDept = sanitizeFilenameSegment(exportData.department.dept_name);
  return `report-${fileDate}-${fileDept}-print.pdf`;
}

export async function buildReportDepartmentPdfBuffer(exportData: ReadyExportData) {
  const thaiFontPath = getThaiFontPath();
  const thaiBoldFontPath = getThaiBoldFontPath();

  if (!thaiFontPath || !thaiBoldFontPath) {
    throw new Error("ไม่พบไฟล์แบบอักษรภาษาไทยสำหรับสร้าง PDF");
  }

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 0,
    bufferPages: true,
    autoFirstPage: true,
    info: {
      Title: `รายงาน ${exportData.batch.report_date} ${exportData.department.dept_name}`,
      Author: "ระบบติดตามเรื่องร้องเรียน เขตทวีวัฒนา"
    }
  });
  const chunks: Buffer[] = [];

  doc.registerFont("Thai", fs.readFileSync(thaiFontPath));
  doc.registerFont("ThaiBold", fs.readFileSync(thaiBoldFontPath));
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  let y = TABLE_TOP_MARGIN;
  drawReportHeader(doc, exportData);
  drawTableHeader(doc, y);
  y += HEADER_ROW_HEIGHT;

  exportData.tickets.forEach((ticket, index) => {
    const row = buildRow(ticket, index);
    const rowHeight = getRowHeight(doc, row);
    const pageBottom = doc.page.height - TABLE_BOTTOM_MARGIN;

    if (y + rowHeight > pageBottom) {
      doc.addPage();
      y = TABLE_TOP_MARGIN;
      drawReportHeader(doc, exportData);
      drawTableHeader(doc, y);
      y += HEADER_ROW_HEIGHT;
    }

    drawRow(doc, row, y, rowHeight);
    y += rowHeight;
  });

  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    addPageFooter(doc, pageIndex, range.count);
  }

  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);
  });
}
