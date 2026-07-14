export function dedupeTicketsById<T extends { ticket_id: string }>(ticketRecords: T[]) {
  const dedupedMap = new Map<string, T>();
  let duplicateRows = 0;

  for (const ticket of ticketRecords) {
    if (dedupedMap.has(ticket.ticket_id)) {
      duplicateRows += 1;
      continue;
    }

    dedupedMap.set(ticket.ticket_id, ticket);
  }

  return {
    ticketRecords: [...dedupedMap.values()],
    duplicateRows
  };
}
