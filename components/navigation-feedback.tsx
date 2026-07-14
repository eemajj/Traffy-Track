"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MouseEvent, useEffect, useState } from "react";

type PendingNavLinkProps = {
  href: string;
  label: string;
};

function shouldIgnoreClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const [pendingFromPathname, setPendingFromPathname] = useState<string | null>(null);
  const isPending = pendingFromPathname === pathname;

  useEffect(() => {
    const handleStart = () => setPendingFromPathname(pathname);
    window.addEventListener("app:navigation-start", handleStart);
    return () => window.removeEventListener("app:navigation-start", handleStart);
  }, [pathname]);

  useEffect(() => {
    if (!isPending) {
      return;
    }

    const timeoutId = window.setTimeout(() => setPendingFromPathname(null), 8000);
    return () => window.clearTimeout(timeoutId);
  }, [isPending]);

  return (
    <div
      className={`navigation-progress fixed inset-x-0 top-0 z-50 h-1 bg-brand transition-opacity ${
        isPending ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden="true"
    />
  );
}

export function PendingNavLink({ href, label }: PendingNavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      onClick={(event) => {
        if (shouldIgnoreClick(event) || isActive) {
          return;
        }

        window.dispatchEvent(new Event("app:navigation-start"));
      }}
      className={`nav-pill inline-flex min-h-11 items-center rounded-2xl border px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-brand/35 hover:bg-white hover:text-brand hover:shadow-hover ${
        isActive ? "border-brand/25 bg-brand/10 text-brand" : "border-border bg-surface text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
