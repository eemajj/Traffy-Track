export type CoHandlingNoteInput = {
  deptList: string[];
  currentDept?: string | null;
};

function getShortDeptName(name: string): string {
  return (name || "").replace(/\s+เขตทวีวัฒนา\s*$/, "").trim();
}

/**
 * Derives concise co-handling note for PDF and Excel reports.
 * Example output: "ฝ่ายเทศกิจ เชิญร่วม ฝ่ายโยธา"
 */
export function getCoHandlingDepartmentNote(input: CoHandlingNoteInput): string {
  const { deptList } = input;

  if (!deptList || deptList.length <= 1) {
    return "";
  }

  const primaryDeptShort = getShortDeptName(deptList[0]);
  const invitedDeptsShort = deptList.slice(1).map(getShortDeptName).join(", ");

  return `${primaryDeptShort} เชิญร่วม ${invitedDeptsShort}`;
}
