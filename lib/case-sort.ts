export type CaseListSort = "received-desc" | "received-asc" | "updated-desc" | "updated-asc";

export type SortableCase = {
  ticket_id: string;
  timestamp: string | null;
  last_activity: string | null;
};

export function normalizeCaseListSort(value: string | undefined): CaseListSort {
  if (value === "received-desc" || value === "received-asc" || value === "updated-asc") {
    return value;
  }

  return "updated-desc";
}

export function getCaseSortField(sort: CaseListSort) {
  return sort.startsWith("received") ? ("timestamp" as const) : ("last_activity" as const);
}

function compareNullableDates(left: string | null, right: string | null, ascending: boolean) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  const comparison = new Date(left).getTime() - new Date(right).getTime();
  return ascending ? comparison : -comparison;
}

export function compareCaseListItems(left: SortableCase, right: SortableCase, sort: CaseListSort) {
  const field = getCaseSortField(sort);
  const dateComparison = compareNullableDates(left[field], right[field], sort.endsWith("asc"));
  return dateComparison || left.ticket_id.localeCompare(right.ticket_id);
}
