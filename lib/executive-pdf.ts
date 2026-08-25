import fs from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit/js/pdfkit.standalone";

import type { AnalyticsReadyData } from "@/lib/analytics";
import { formatBangkokDateTime } from "./date-utils.ts";
import type { SystemStatus } from "@/lib/system-status";

const FONT = path.join(process.cwd(), "public", "fonts", "tahoma.ttf");
const FONT_BOLD = path.join(process.cwd(), "public", "fonts", "tahomabd.ttf");

function number(value: number) { return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 }).format(value); }
function dateTime(value: string | null) { return value ? formatBangkokDateTime(value) : "ไม่ระบุ"; }
function change(value: number | null) { return value === null ? "ไม่มีฐานเปรียบเทียบ" : `${value > 0 ? "+" : ""}${number(value)}%`; }

export async function buildExecutiveSummaryPdf(data: AnalyticsReadyData, status: SystemStatus) {
  if (!fs.existsSync(FONT) || !fs.existsSync(FONT_BOLD)) throw new Error("ไม่พบแบบอักษรภาษาไทย");
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Title: "Executive Summary ระบบติดตามเรื่องร้องเรียน เขตทวีวัฒนา", Author: "สำนักงานเขตทวีวัฒนา" } });
  const chunks: Buffer[] = [];
  doc.registerFont("Thai", fs.readFileSync(FONT));
  doc.registerFont("ThaiBold", fs.readFileSync(FONT_BOLD));
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const width = doc.page.width - 84;
  doc.rect(0, 0, doc.page.width, 108).fill("#005F3E");
  doc.font("ThaiBold").fillColor("#FFFFFF").fontSize(19).text("สรุปสถานการณ์เรื่องร้องเรียน", 42, 32, { width });
  doc.font("Thai").fontSize(10).text(`เขตทวีวัฒนา · ช่วง ${data.periodDays} วัน · จัดทำ ${dateTime(data.generatedAt)}`, 42, 66, { width });
  doc.fillColor("#11251D").font("Thai");
  let y = 132;
  doc.font("ThaiBold").fontSize(13).text("ภาพรวมสำหรับผู้บริหาร", 42, y); y += 26;
  const metrics = [
    ["รับเรื่องเข้า", number(data.summary.createdCount)], ["ตรวจพบว่าปิด", number(data.summary.closedCount)],
    ["คงค้างปัจจุบัน", number(data.summary.pendingNow)], ["พิกัดพร้อมใช้", `${number(data.summary.coordinateCoveragePercent)}%`]
  ];
  metrics.forEach(([label, value], index) => {
    const x = 42 + (index % 2) * 258;
    const rowY = y + Math.floor(index / 2) * 62;
    doc.roundedRect(x, rowY, 240, 50, 8).fill("#EAF4EF");
    doc.fillColor("#526B61").font("Thai").fontSize(9).text(label, x + 12, rowY + 9, { width: 110 });
    doc.fillColor("#11251D").font("ThaiBold").fontSize(18).text(value, x + 125, rowY + 12, { width: 100, align: "right" });
  });
  y += 136;
  doc.font("ThaiBold").fontSize(13).fillColor("#11251D").text("เทียบกับช่วงก่อนหน้า", 42, y); y += 24;
  doc.font("Thai").fontSize(10).text(`เรื่องรับเข้า ${change(data.comparison.createdChangePercent)} (ช่วงก่อนหน้า ${number(data.comparison.createdCount)} เรื่อง)`, 42, y); y += 18;
  doc.text(`เรื่องที่ปิด ${change(data.comparison.closedChangePercent)} (ช่วงก่อนหน้า ${number(data.comparison.closedCount)} เรื่อง)`, 42, y); y += 30;
  doc.font("ThaiBold").fontSize(13).text("พื้นที่ที่พบเรื่องหนาแน่น", 42, y); y += 24;
  data.hotspots.slice(0, 5).forEach((spot, index) => {
    doc.font("ThaiBold").fontSize(10).text(`${index + 1}. ${spot.subdistrict}`, 42, y, { width: 180 });
    doc.font("Thai").text(`${number(spot.totalCount)} เรื่อง · คงค้าง ${number(spot.pendingCount)} · รัศมี ${number(spot.radiusMeters)} เมตร`, 220, y, { width: 330, align: "right" });
    y += 20;
  });
  y += 10;
  doc.font("ThaiBold").fontSize(13).text("คุณภาพและความสดใหม่ของข้อมูล", 42, y); y += 24;
  doc.font("Thai").fontSize(10).text(`นำเข้าล่าสุด: ${dateTime(status.latestImportAt)}${status.latestImportFilename ? ` · ${status.latestImportFilename}` : ""}`, 42, y, { width }); y += 18;
  doc.text(`ความครอบคลุมพิกัด: ${number(data.summary.coordinateCoveragePercent)}% · สถานะระบบ: ${status.maintenanceEnabled ? "อ่านอย่างเดียวระหว่างบำรุงรักษา" : "พร้อมใช้งาน"}`, 42, y, { width });
  doc.fontSize(8).fillColor("#526B61").text("หมายเหตุ: เอกสารนี้เป็นภาพรวมเพื่อประกอบการตัดสินใจ ตัวเลขอ้างอิงข้อมูลที่มีอยู่ในระบบ ณ เวลาจัดทำ", 42, doc.page.height - 54, { width });
  doc.end();
  return new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
}
