"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function ContextReturnLink() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  if (!returnTo || (returnTo !== "/map" && !returnTo.startsWith("/map?"))) {
    return null;
  }

  return (
    <div className="mb-4">
      <Link
        href={returnTo}
        className="inline-flex min-h-11 items-center rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-brand/40 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span aria-hidden="true">←</span>
        <span className="ml-2">กลับแผนที่พร้อมตัวกรองเดิม</span>
      </Link>
    </div>
  );
}
