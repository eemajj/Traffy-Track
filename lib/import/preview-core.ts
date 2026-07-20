export function trimPartialCsvToCompleteRecords(text: string) {
  let inQuotedField = false;
  let lastCompleteRecordEnd = -1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (inQuotedField && text[index + 1] === '"') {
        index += 1;
      } else {
        inQuotedField = !inQuotedField;
      }
      continue;
    }

    if (!inQuotedField && (character === "\n" || character === "\r")) {
      lastCompleteRecordEnd = index + 1;
    }
  }

  return lastCompleteRecordEnd > 0 ? text.slice(0, lastCompleteRecordEnd) : text;
}
