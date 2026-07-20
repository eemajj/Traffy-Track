"use client";

import Image from "next/image";
import { useState } from "react";

export function CasePhoto({ ticketId, photoUrl }: { ticketId: string; photoUrl: string }) {
  const [failed, setFailed] = useState(false);
  const captionId = `case-photo-caption-${ticketId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <figure className="overflow-hidden rounded-2xl bg-surface">
      {failed ? (
        <div className="flex aspect-[4/3] min-h-56 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-semibold text-ink">ไม่สามารถแสดงภาพตัวอย่างได้</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
            ไฟล์ต้นทางอาจถูกย้ายหรือไม่พร้อมใช้งานชั่วคราว
          </p>
        </div>
      ) : (
        <a
          href={photoUrl}
          target="_blank"
          rel="noreferrer"
          aria-describedby={captionId}
          className="group relative block aspect-[4/3] min-h-56 overflow-hidden bg-surface-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
        >
          <Image
            src={photoUrl}
            alt={`ภาพประกอบเรื่องร้องเรียน ${ticketId} จาก CityData`}
            fill
            unoptimized
            sizes="(min-width: 1024px) 38vw, 100vw"
            className="object-contain transition-transform duration-200 ease-out group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            onError={() => setFailed(true)}
          />
        </a>
      )}

      <figcaption id={captionId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink">ภาพจากระบบ CityData</p>
          <p className="mt-0.5 text-xs text-muted">ใช้ประกอบการตรวจสอบรายละเอียดของเรื่อง</p>
        </div>
        <a
          href={photoUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-brand/30 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
        >
          {failed ? "ลองเปิดไฟล์ต้นฉบับ" : "เปิดภาพขนาดเต็ม"}
        </a>
      </figcaption>
    </figure>
  );
}
