import fs from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit/js/pdfkit.standalone";

import { SUMMARY_PENDING_STATES, type SummaryReportData } from "@/lib/summary-report";

const FONT = path.join(process.cwd(), "public", "fonts", "tahoma.ttf");
const FONT_BOLD = path.join(process.cwd(), "public", "fonts", "tahomabd.ttf");
const PAGE_MARGIN = 22;
const INK = "#111111";
const GRID = "#222222";

type CellOptions = {
  bold?: boolean;
  size?: number;
  align?: "left" | "center" | "right";
  fill?: string;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
};

function thaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok"
  }).format(new Date(`${value}T12:00:00+07:00`));
}

function thaiDateTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Bangkok"
  }).format(new Date(value));
}

function number(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function percent(value: number, total: number) {
  if (total <= 0) return "0.00%";
  return `${((value / total) * 100).toFixed(2)}%`;
}

function text(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: CellOptions = {}
) {
  const fontSize = options.size || 9;
  doc.font(options.bold ? "ThaiBold" : "Thai").fontSize(fontSize).fillColor(INK);
  const measuredHeight = Math.min(height, value.split("\n").length * fontSize * 1.3);
  const textY = y + Math.max(0, (height - measuredHeight) / 2);

  doc.text(value, x, textY, {
      width,
      align: options.align || "center",
      lineGap: 1
  });
}

function cell(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: CellOptions = {}
) {
  if (options.fill) {
    doc.rect(x, y, width, height).fill(options.fill);
  }
  doc.rect(x, y, width, height).stroke(GRID);
  const padding = options.padding ?? 4;
  const paddingX = options.paddingX ?? padding;
  const paddingY = options.paddingY ?? padding;
  text(doc, value, x + paddingX, y + paddingY, width - paddingX * 2, height - paddingY * 2, options);
}

function drawDocumentHeading(doc: PDFKit.PDFDocument, data: SummaryReportData) {
  const width = doc.page.width - PAGE_MARGIN * 2;
  text(doc, "ข้อมูลเรื่องรับแจ้ง ผ่านแอปพลิเคชัน Traffy Fondue", PAGE_MARGIN, 28, width, 18, {
    bold: true,
    size: 13
  });
  text(doc, `ระหว่างวันที่ ${thaiDate(data.fromDate)} - ${thaiDate(data.toDate)}`, PAGE_MARGIN, 52, width, 18, {
    bold: true,
    size: 12
  });
  text(doc, data.officeName, PAGE_MARGIN, 77, width, 18, { bold: true, size: 12 });
}

function drawFooter(doc: PDFKit.PDFDocument, data: SummaryReportData) {
  const width = doc.page.width - PAGE_MARGIN * 2;
  text(doc, `+ ข้อมูลดังกล่าวออก ณ วันที่ ${thaiDateTime(data.generatedAt)} น. +`, PAGE_MARGIN, doc.page.height - 34, width, 16, {
    bold: true,
    size: 9
  });
}

function drawPageBackground(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFFFFF");
  doc.restore();
}

function drawSummaryPage(doc: PDFKit.PDFDocument, data: SummaryReportData) {
  drawPageBackground(doc);
  drawDocumentHeading(doc, data);
  const widths = [40, 45, 45, 55, 50, 42, 45, 48, 42, 42, 50, 42, 46, 46, 55, 45, 52];
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  const x0 = (doc.page.width - tableWidth) / 2;
  let y = 112;

  cell(doc, "สถิติเรื่องร้องเรียน", x0, y, tableWidth, 30, { bold: true, size: 11 });
  y += 30;
  const intakeWidth = widths.slice(0, 5).reduce((sum, width) => sum + width, 0);
  const resultWidth = tableWidth - intakeWidth;
  cell(doc, "รับเรื่อง (จำนวน)", x0, y, intakeWidth, 34, { bold: true, size: 10 });
  cell(doc, "ผลการดำเนินการ", x0 + intakeWidth, y, resultWidth, 17, { bold: true, size: 10 });
  const completeWidth = widths.slice(5, 8).reduce((sum, width) => sum + width, 0);
  cell(doc, "เสร็จสิ้น", x0 + intakeWidth, y + 17, completeWidth, 17, { bold: true, size: 9 });
  cell(doc, "อยู่ระหว่างดำเนินการ", x0 + intakeWidth + completeWidth, y + 17, resultWidth - completeWidth, 17, {
    bold: true,
    size: 9
  });
  y += 34;

  const labels = [
    "ทั้งหมด",
    "รอรับเรื่อง",
    "เขต",
    "หน่วยงานอื่น",
    "ไม่เกี่ยวข้อง",
    "รวม",
    "เขต",
    "หน่วยงานอื่น",
    "รวม",
    "รับเรื่อง",
    "กำลัง\nดำเนินการ",
    "ศึกษา\nปัญหา",
    "ของบ\nประมาณ",
    "จัดซื้อ\nจัดจ้าง",
    "ขั้นตอน\nทางกฎหมาย",
    "ติดตาม\nเรื่อง",
    "ส่งต่อ\n(ใหม่)"
  ];
  let x = x0;
  labels.forEach((label, index) => {
    cell(doc, label, x, y, widths[index], 47, { bold: true, size: 7.6 });
    x += widths[index];
  });
  y += 47;

  const state = data.pending.byState;
  const values = [
    data.total,
    data.intake.waiting,
    data.intake.district,
    data.intake.otherAgency,
    data.intake.irrelevant,
    data.completed.total,
    data.completed.district,
    data.completed.otherAgency,
    data.pending.total,
    state["รับเรื่อง"],
    state["กำลังดำเนินการ"],
    state["ศึกษาปัญหา"],
    state["ของบประมาณ"],
    state["จัดซื้อจัดจ้าง"],
    state["ขั้นตอนทางกฎหมาย"],
    state["ติดตามเรื่อง"],
    state["ส่งต่อ(ใหม่)"]
  ];
  x = x0;
  values.forEach((value, index) => {
    cell(doc, number(value), x, y, widths[index], 28, { size: 8.5 });
    x += widths[index];
  });
  y += 28;

  const percentages = [
    percent(data.total, data.total),
    percent(data.intake.waiting, data.total),
    percent(data.intake.district, data.total),
    percent(data.intake.otherAgency, data.total),
    percent(data.intake.irrelevant, data.total),
    "",
    percent(data.completed.district, data.completed.total),
    percent(data.completed.otherAgency, data.completed.total),
    "",
    ...SUMMARY_PENDING_STATES.map((pendingState) => percent(state[pendingState], data.pending.total))
  ];
  x = x0;
  percentages.forEach((value, index) => {
    cell(doc, value, x, y, widths[index], 30, { size: 7.4 });
    x += widths[index];
  });

  text(doc, "หมายเหตุ :", x0 + tableWidth * 0.5, y + 43, tableWidth * 0.5, 18, { bold: true, size: 9 });
  text(
    doc,
    `- จำนวนเรื่องที่อยู่ระหว่างดำเนินการของสำนักงานเขตทั้งหมดในช่วงที่เลือก มี ${number(data.pending.actionableTotal)} เรื่อง`,
    x0 + tableWidth * 0.5,
    y + 64,
    tableWidth * 0.5,
    30,
    { size: 8, align: "left" }
  );
}

function getDepartmentRows(department: SummaryReportData["departments"][number]) {
  return 2 + department.byState.length;
}

function drawDepartmentTableHeader(doc: PDFKit.PDFDocument, y: number) {
  const widths = [70, 360, 170];
  const x0 = (doc.page.width - widths.reduce((sum, width) => sum + width, 0)) / 2;
  cell(doc, "ลำดับที่", x0, y, widths[0], 42, { bold: true, size: 10 });
  cell(doc, "หน่วยงาน", x0 + widths[0], y, widths[1], 42, { bold: true, size: 10 });
  cell(doc, "จำนวน (เรื่อง)", x0 + widths[0] + widths[1], y, widths[2], 42, { bold: true, size: 10 });
  return { x0, widths, nextY: y + 42 };
}

type IndexedDepartment = {
  index: number;
  department: SummaryReportData["departments"][number];
};

function paginateDepartments(data: SummaryReportData) {
  const capacity = 360;
  const groups: IndexedDepartment[][] = [];
  let group: IndexedDepartment[] = [];
  let used = 0;

  data.departments.forEach((department, index) => {
    const height = getDepartmentRows(department) * 27;
    if (group.length > 0 && used + height > capacity) {
      groups.push(group);
      group = [];
      used = 0;
    }
    group.push({ index, department });
    used += height;
  });

  if (group.length > 0) groups.push(group);
  if (groups.length === 0) return [[]] as IndexedDepartment[][];

  const lastGroup = groups.at(-1) || [];
  const lastHeight = lastGroup.reduce((sum, entry) => sum + getDepartmentRows(entry.department) * 27, 0);
  if (lastHeight + 34 > capacity) {
    const moved = lastGroup.pop();
    if (moved) groups.push([moved]);
  }
  return groups;
}

function drawDepartmentPage(
  doc: PDFKit.PDFDocument,
  data: SummaryReportData,
  group: IndexedDepartment[],
  isLastPage: boolean
) {
  drawPageBackground(doc);
  drawDocumentHeading(doc, data);
  text(doc, "เรื่องร้องเรียนคงค้าง สถานะกำลังดำเนินการ รับเรื่อง และสถานะอื่น ๆ", PAGE_MARGIN, 108, doc.page.width - PAGE_MARGIN * 2, 20, {
    bold: true,
    size: 11
  });
  const table = drawDepartmentTableHeader(doc, 139);
  let y = table.nextY;

  if (data.departments.length === 0) {
    cell(doc, "-", table.x0, y, table.widths[0], 54, { size: 10 });
    cell(doc, "ไม่มีเรื่องร้องเรียนคงค้างของฝ่ายภายในเขตในช่วงวันที่เลือก", table.x0 + table.widths[0], y, table.widths[1], 54, {
      size: 10
    });
    cell(doc, "0", table.x0 + table.widths[0] + table.widths[1], y, table.widths[2], 54, { size: 10 });
    return;
  }

  for (const { index, department } of group) {
    const { x0, widths } = table;
    const groupHeight = getDepartmentRows(department) * 27;
    cell(doc, `${index + 1}.`, x0, y, widths[0], groupHeight, { size: 9 });
    cell(doc, department.name, x0 + widths[0], y, widths[1] + widths[2], 27, {
      size: 9,
      align: "left",
      paddingX: 8,
      paddingY: 4
    });
    let rowY = y + 27;

    for (const entry of department.byState) {
      cell(doc, `-   ${entry.state}`, x0 + widths[0], rowY, widths[1], 27, {
        bold: true,
        size: 8.5,
        align: "left",
        paddingX: 20,
        paddingY: 4
      });
      cell(doc, number(entry.count), x0 + widths[0] + widths[1], rowY, widths[2], 27, { size: 9 });
      rowY += 27;
    }

    cell(doc, "รวม", x0 + widths[0], rowY, widths[1], 27, { bold: true, size: 9 });
    cell(doc, number(department.total), x0 + widths[0] + widths[1], rowY, widths[2], 27, { bold: true, size: 9 });
    y += groupHeight;
  }

  if (isLastPage) {
    cell(doc, "", table.x0, y, table.widths[0], 34);
    cell(doc, "ภาพรวมของหน่วยงาน", table.x0 + table.widths[0], y, table.widths[1], 34, { bold: true, size: 10 });
    cell(doc, number(data.departments.reduce((sum, department) => sum + department.total, 0)), table.x0 + table.widths[0] + table.widths[1], y, table.widths[2], 34, {
      bold: true,
      size: 10
    });
  }
}

export function buildSummaryReportPdfFilename(data: SummaryReportData) {
  return `traffy-summary-${data.fromDate}-${data.toDate}.pdf`;
}

export async function buildSummaryReportPdf(data: SummaryReportData) {
  if (!fs.existsSync(FONT) || !fs.existsSync(FONT_BOLD)) {
    throw new Error("ไม่พบแบบอักษรภาษาไทยสำหรับสร้าง PDF");
  }

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 0,
    bufferPages: false,
    autoFirstPage: false,
    info: {
      Title: `สรุปรายงาน Traffy Fondue ${data.fromDate} ถึง ${data.toDate}`,
      Author: data.officeName
    }
  });
  const chunks: Buffer[] = [];
  doc.registerFont("Thai", fs.readFileSync(FONT));
  doc.registerFont("ThaiBold", fs.readFileSync(FONT_BOLD));
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const departmentPages = paginateDepartments(data);
  doc.addPage();
  drawSummaryPage(doc, data);
  drawFooter(doc, data);
  departmentPages.forEach((group, index) => {
    doc.addPage();
    drawDepartmentPage(doc, data, group, index === departmentPages.length - 1);
    drawFooter(doc, data);
  });
  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
