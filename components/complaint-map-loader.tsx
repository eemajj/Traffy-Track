"use client";

import dynamic from "next/dynamic";

import type { ComplaintMapPoint } from "@/lib/map";

const ClientComplaintMap = dynamic(
  () => import("@/components/complaint-map").then((module) => module.ComplaintMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[30rem] items-center justify-center bg-surface text-sm text-muted">
        กำลังเตรียมแผนที่…
      </div>
    )
  }
);

export function ComplaintMapLoader({ points }: { points: ComplaintMapPoint[] }) {
  return <ClientComplaintMap points={points} />;
}
