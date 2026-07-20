"use client";

import dynamic from "next/dynamic";

import type { ComplaintMapPoint, MapFocus } from "@/lib/map";

const ClientComplaintMap = dynamic(
  () => import("@/components/complaint-map").then((module) => module.ComplaintMap),
  {
    ssr: false,
    loading: () => (
      <div className="grid animate-pulse lg:grid-cols-[22rem_minmax(0,1fr)]" role="status" aria-label="กำลังเตรียมแผนที่และรายการเคส">
        <div className="complaint-map-results order-last border-t border-border bg-white p-4 lg:order-first lg:border-r lg:border-t-0">
          <div className="h-5 w-36 rounded bg-surface-strong" />
          <div className="mt-5 space-y-4">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-20 rounded-xl bg-surface" />)}
          </div>
        </div>
        <div className="complaint-map order-first bg-surface lg:order-last" />
        <span className="sr-only">กำลังเตรียมแผนที่…</span>
      </div>
    )
  }
);

export function ComplaintMapLoader({ points, focus, returnTo }: { points: ComplaintMapPoint[]; focus?: MapFocus | null; returnTo: string }) {
  return <ClientComplaintMap points={points} focus={focus} returnTo={returnTo} />;
}
