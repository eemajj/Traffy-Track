import Link from "next/link";
import { ReactNode } from "react";

import { appNavigation } from "@/lib/routes";

type AppShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function AppShell({ title, description, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 overflow-hidden rounded-[28px] border border-border/80 bg-white/90 p-6 shadow-panel backdrop-blur">
          <div className="mb-6 h-1.5 w-28 rounded-full bg-brand/80" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold tracking-[0.01em] text-muted">
                ระบบติดตามเรื่องร้องเรียน เขตทวีวัฒนา
              </p>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.02em] text-ink">{title}</h1>
              <p className="max-w-3xl text-sm leading-6 text-muted">{description}</p>
            </div>
            <nav className="flex flex-wrap gap-2">
              {appNavigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-brand/35 hover:bg-white hover:text-brand hover:shadow-hover"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex-1 pb-8">{children}</main>
      </div>
    </div>
  );
}
