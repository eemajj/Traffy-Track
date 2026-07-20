export type BatchCommandResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

export type BatchCommandDependencies = {
  hasAdminEnv: () => boolean;
  createSnapshot: (input: {
    reportDate: string;
    note: string | null;
    idempotencyKey: string;
  }) => Promise<BatchCommandResult<unknown>>;
  updateBatch: (input: {
    batchId: string;
    reportDate: string;
    note: string | null;
  }) => Promise<BatchCommandResult<{ id: string }>>;
  deleteBatch: (batchId: string) => Promise<BatchCommandResult<unknown>>;
};

const REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createReportBatchCommandService(deps: BatchCommandDependencies) {
  const assertConfigured = () => {
    if (!deps.hasAdminEnv()) throw new Error("ระบบยังไม่ได้ตั้งค่า Supabase");
  };

  return {
    async create(input: { reportDate: string; note: string | null; idempotencyKey: string }) {
      assertConfigured();
      if (!REPORT_DATE_PATTERN.test(input.reportDate)) {
        throw new Error("กรุณาระบุวันที่ของรอบรายงาน");
      }
      if (!UUID_PATTERN.test(input.idempotencyKey)) {
        throw new Error("รหัสป้องกันการสร้างรอบรายงานซ้ำไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง");
      }

      const result = await deps.createSnapshot(input);
      if (result.error || !result.data) {
        throw new Error(`สร้างรอบรายงานแบบ transaction ไม่สำเร็จ: ${result.error?.message || "ไม่ทราบสาเหตุ"}`);
      }
      return { batchId: String(result.data) };
    },

    async update(input: { batchId: string; reportDate: string; note: string | null }) {
      assertConfigured();
      if (!input.batchId) throw new Error("ไม่พบรหัสรอบรายงานที่ต้องการแก้ไข");
      if (!REPORT_DATE_PATTERN.test(input.reportDate)) {
        throw new Error("กรุณาระบุวันที่รอบรายงานให้ถูกต้อง");
      }

      const result = await deps.updateBatch(input);
      if (result.error) throw new Error(`แก้ไขรอบรายงานไม่สำเร็จ: ${result.error.message}`);
      if (!result.data) throw new Error("ไม่พบรอบรายงานที่ต้องการแก้ไข");
      return { batchId: result.data.id };
    },

    async delete(batchId: string) {
      assertConfigured();
      if (!batchId) throw new Error("ไม่พบรหัสรอบรายงานที่ต้องการลบ");

      const result = await deps.deleteBatch(batchId);
      if (result.error) throw new Error(`ลบรอบรายงานไม่สำเร็จ: ${result.error.message}`);
      return { batchId };
    }
  };
}
