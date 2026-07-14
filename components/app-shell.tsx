import { ReactNode } from "react";

import { logoutAction } from "@/app/login/actions";
import { NavigationProgress, PendingNavLink } from "@/components/navigation-feedback";
import { getCurrentSessionClaims } from "@/lib/auth";
import { appNavigation } from "@/lib/routes";

type AppShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export async function AppShell({ title, description, children }: AppShellProps) {
  const session = await getCurrentSessionClaims();
  const navigationItems = appNavigation.filter((item) => session && item.roles.includes(session.role));

  return (
    <div className="min-h-screen bg-bg text-ink">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-xl bg-brand px-4 py-3 font-semibold text-white shadow-panel focus:not-sr-only"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>
      <NavigationProgress />
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="app-header motion-shell mb-8 overflow-hidden rounded-[28px] border border-border/80 bg-white/95 p-6 shadow-panel">
          <div className="motion-rail mb-6 h-1.5 w-28 rounded-full bg-brand/80" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold tracking-[0.01em] text-muted">
                ระบบติดตามเรื่องร้องเรียน เขตทวีวัฒนา
              </p>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.02em] text-ink">{title}</h1>
              <p className="max-w-3xl text-sm leading-6 text-muted">{description}</p>
            </div>
            <nav aria-label="เมนูหลัก" className="flex flex-wrap gap-2">
              {session ? (
                <span className="inline-flex items-center rounded-full bg-surface px-3 py-2 text-xs font-semibold text-muted">
                  สิทธิ์: {session.role === "admin" ? "ผู้ดูแลระบบ" : "เจ้าหน้าที่"}
                </span>
              ) : null}
              {navigationItems.map((item) => (
                <PendingNavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                />
              ))}
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-muted transition hover:border-danger/30 hover:bg-danger/5 hover:text-danger"
                >
                  ออกจากระบบ
                </button>
              </form>
            </nav>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="motion-stack flex-1 pb-8">{children}</main>
      </div>
    </div>
  );
}
