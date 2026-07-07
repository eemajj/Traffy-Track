import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { hasValidSessionCookie } from "@/lib/auth";

type LoginPageProps = {
  searchParams?: {
    next?: string;
  };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (await hasValidSessionCookie()) {
    redirect("/dashboard");
  }

  const nextPath = searchParams?.next && searchParams.next.startsWith("/") ? searchParams.next : "/dashboard";

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-border/80 bg-white p-8 shadow-panel">
        <div className="mb-8 h-1.5 w-24 rounded-full bg-brand/80" />
        <div className="mb-8 space-y-3">
          <p className="text-sm font-semibold tracking-[0.01em] text-muted">พื้นที่สำหรับเจ้าหน้าที่</p>
          <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">ระบบติดตามเรื่องร้องเรียน</h1>
          <p className="text-sm leading-6 text-muted">
            ระบบนี้ใช้รหัสผ่านเดียวสำหรับเข้าถึงหน้าจัดการนำเข้าข้อมูล หน้าภาพรวมระบบ และหน้ารอบรายงาน
          </p>
        </div>
        <LoginForm nextPath={nextPath} />
      </div>
    </div>
  );
}
