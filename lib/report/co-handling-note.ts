export type CoHandlingNoteInput = {
  deptList: string[];
  currentDept?: string | null;
};

/**
 * Derives co-handling note for a ticket relative to a given department or for general display.
 * - For Primary Department (deptList[0]): "[ผู้เชิญร่วม] ➔ เชิญร่วมดำเนินการ: ฝ่าย..."
 * - For Invited Department (deptList[1..n]): "[ผู้ถูกเชิญร่วม] ⬅️ ถูกเชิญร่วมโดย: ฝ่าย..."
 */
export function getCoHandlingDepartmentNote(input: CoHandlingNoteInput): string {
  const { deptList, currentDept } = input;

  if (!deptList || deptList.length <= 1) {
    return "";
  }

  const primaryDept = deptList[0];
  const coHandlingDepts = deptList.slice(1);

  if (!currentDept) {
    return `[เชิญร่วม] ฝ่ายหลัก: ${primaryDept} | เชิญร่วม: ${coHandlingDepts.join(", ")}`;
  }

  if (currentDept === primaryDept) {
    return `[ผู้เชิญร่วม] ➔ เชิญร่วมดำเนินการ: ${coHandlingDepts.join(", ")}`;
  }

  return `[ผู้ถูกเชิญร่วม] ⬅️ ถูกเชิญร่วมโดย: ${primaryDept}`;
}
