export type DataQualityTicket = {
  ticket_id: string;
  type: string | null;
  comment: string | null;
  address: string | null;
  org_response: string | null;
  dept_list: string[];
  hashtag: string | null;
  lat: number | null;
  lng: number | null;
};

export type SemanticDuplicateExample = {
  ticketIds: string[];
  reason: string;
};

export type DepartmentSuggestionExample = {
  ticketId: string;
  category: string;
  matchedKeywords: string[];
};

export type AttentionHintExample = {
  ticketId: string;
  level: "urgent" | "review";
  label: string;
  matchedKeywords: string[];
};

export type DataQualitySignals = {
  semanticDuplicateGroupCount: number;
  semanticDuplicateTicketCount: number;
  semanticDuplicateExamples: SemanticDuplicateExample[];
  departmentSuggestionCount: number;
  departmentSuggestionExamples: DepartmentSuggestionExample[];
  urgentAttentionCount: number;
  reviewAttentionCount: number;
  attentionExamples: AttentionHintExample[];
};

type KeywordRule = {
  keyword: string;
  weight: number;
};

type DepartmentRule = {
  category: string;
  keywords: KeywordRule[];
};

const EXAMPLE_LIMIT = 4;
const NEARBY_DISTANCE_METERS = 80;

const departmentRules: DepartmentRule[] = [
  {
    category: "งานโยธา",
    keywords: [
      { keyword: "ถนนชำรุด", weight: 3 },
      { keyword: "ทางเท้าชำรุด", weight: 3 },
      { keyword: "ฝาท่อ", weight: 3 },
      { keyword: "หลุมบ่อ", weight: 3 },
      { keyword: "ท่อระบายน้ำ", weight: 2 },
      { keyword: "ไฟส่องสว่าง", weight: 2 },
      { keyword: "ไฟทาง", weight: 2 },
      { keyword: "ทางเท้า", weight: 1 },
      { keyword: "ถนน", weight: 1 }
    ]
  },
  {
    category: "งานรักษาความสะอาดและสวนสาธารณะ",
    keywords: [
      { keyword: "เก็บขยะ", weight: 3 },
      { keyword: "ขยะตกค้าง", weight: 3 },
      { keyword: "กิ่งไม้", weight: 2 },
      { keyword: "วัชพืช", weight: 2 },
      { keyword: "ตัดหญ้า", weight: 2 },
      { keyword: "ต้นไม้", weight: 1 },
      { keyword: "ขยะ", weight: 2 },
      { keyword: "สวนสาธารณะ", weight: 2 }
    ]
  },
  {
    category: "งานเทศกิจ",
    keywords: [
      { keyword: "หาบเร่", weight: 3 },
      { keyword: "แผงลอย", weight: 3 },
      { keyword: "ป้ายโฆษณา", weight: 2 },
      { keyword: "กีดขวาง", weight: 2 },
      { keyword: "รุกล้ำ", weight: 2 },
      { keyword: "จอดรถ", weight: 2 },
      { keyword: "ตั้งของบนทางเท้า", weight: 3 }
    ]
  },
  {
    category: "งานสิ่งแวดล้อมและสุขาภิบาล",
    keywords: [
      { keyword: "น้ำเสีย", weight: 3 },
      { keyword: "กลิ่นเหม็น", weight: 3 },
      { keyword: "เผาขยะ", weight: 3 },
      { keyword: "ควัน", weight: 2 },
      { keyword: "เสียงดัง", weight: 2 },
      { keyword: "มลพิษ", weight: 2 },
      { keyword: "ฝุ่น", weight: 1 },
      { keyword: "สุนัข", weight: 1 },
      { keyword: "หนู", weight: 1 }
    ]
  }
];

const urgentAttentionKeywords = [
  "ไฟไหม้",
  "เพลิงไหม้",
  "ไฟฟ้ารั่ว",
  "สายไฟขาด",
  "สายไฟตก",
  "เสาไฟล้ม",
  "ต้นไม้ล้ม",
  "อาคารถล่ม",
  "คนเจ็บ",
  "อุบัติเหตุ",
  "ฝาท่อหาย",
  "น้ำท่วมสูง",
  "แก๊สรั่ว",
  "ก๊าซรั่ว"
];

const reviewAttentionKeywords = [
  "อันตราย",
  "เสี่ยง",
  "เกือบเกิดอุบัติเหตุ",
  "ร้องเรียนหลายครั้ง",
  "แจ้งหลายครั้ง",
  "ยังไม่แก้",
  "ซ้ำซาก",
  "เร่งด่วน",
  "ด่วน"
];

export function createEmptyDataQualitySignals(): DataQualitySignals {
  return {
    semanticDuplicateGroupCount: 0,
    semanticDuplicateTicketCount: 0,
    semanticDuplicateExamples: [],
    departmentSuggestionCount: 0,
    departmentSuggestionExamples: [],
    urgentAttentionCount: 0,
    reviewAttentionCount: 0,
    attentionExamples: []
  };
}

function normalizeComparableText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("th-TH")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value: string) {
  return value.replace(/\s+/g, "");
}

function getCharacterNgrams(value: string, size = 3) {
  const compact = compactText(value);
  const grams = new Set<string>();

  if (compact.length < size) {
    if (compact) grams.add(compact);
    return grams;
  }

  for (let index = 0; index <= compact.length - size; index += 1) {
    grams.add(compact.slice(index, index + size));
  }

  return grams;
}

function jaccardSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftGrams = getCharacterNgrams(left);
  const rightGrams = getCharacterNgrams(right);
  let intersection = 0;

  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) intersection += 1;
  }

  const union = leftGrams.size + rightGrams.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function hasValidCoordinates(ticket: DataQualityTicket) {
  return Number.isFinite(ticket.lat) && Number.isFinite(ticket.lng);
}

function distanceMeters(left: DataQualityTicket, right: DataQualityTicket) {
  if (!hasValidCoordinates(left) || !hasValidCoordinates(right)) return null;

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const leftLat = toRadians(left.lat as number);
  const rightLat = toRadians(right.lat as number);
  const latDelta = toRadians((right.lat as number) - (left.lat as number));
  const lngDelta = toRadians((right.lng as number) - (left.lng as number));
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(lngDelta / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function findDuplicateReason(left: DataQualityTicket, right: DataQualityTicket) {
  if (!left.ticket_id || !right.ticket_id || left.ticket_id === right.ticket_id) return null;

  const leftComplaint = normalizeComparableText([left.type, left.comment].filter(Boolean).join(" "));
  const rightComplaint = normalizeComparableText([right.type, right.comment].filter(Boolean).join(" "));
  const shortestComplaintLength = Math.min(compactText(leftComplaint).length, compactText(rightComplaint).length);

  if (shortestComplaintLength < 20) return null;

  const complaintSimilarity = jaccardSimilarity(leftComplaint, rightComplaint);
  const exactComplaint = leftComplaint === rightComplaint;
  const nearComplaint = shortestComplaintLength >= 28 && complaintSimilarity >= 0.88;

  if (!exactComplaint && !nearComplaint) return null;

  const distance = distanceMeters(left, right);
  if (distance !== null) {
    if (distance <= NEARBY_DISTANCE_METERS) {
      return exactComplaint
        ? `ข้อความตรงกันและพิกัดอยู่ใกล้กันไม่เกิน ${NEARBY_DISTANCE_METERS} เมตร`
        : `ข้อความคล้ายกันมากและพิกัดอยู่ใกล้กันไม่เกิน ${NEARBY_DISTANCE_METERS} เมตร`;
    }

    return null;
  }

  const leftAddress = normalizeComparableText(left.address);
  const rightAddress = normalizeComparableText(right.address);
  const shortestAddressLength = Math.min(compactText(leftAddress).length, compactText(rightAddress).length);
  const addressSimilarity = shortestAddressLength >= 8 ? jaccardSimilarity(leftAddress, rightAddress) : 0;

  if (addressSimilarity >= 0.9) {
    return exactComplaint ? "ข้อความตรงกันและที่อยู่คล้ายกันมาก" : "ข้อความและที่อยู่คล้ายกันมาก";
  }

  return null;
}

function buildSemanticDuplicateSummary(tickets: DataQualityTicket[]) {
  const uniqueTickets = Array.from(
    tickets.reduce((byId, ticket) => {
      if (ticket.ticket_id && !byId.has(ticket.ticket_id)) byId.set(ticket.ticket_id, ticket);
      return byId;
    }, new Map<string, DataQualityTicket>()).values()
  );
  const parent = uniqueTickets.map((_, index) => index);
  const edges: Array<{ left: number; right: number; reason: string }> = [];

  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  for (let left = 0; left < uniqueTickets.length; left += 1) {
    for (let right = left + 1; right < uniqueTickets.length; right += 1) {
      const reason = findDuplicateReason(uniqueTickets[left], uniqueTickets[right]);
      if (!reason) continue;
      union(left, right);
      edges.push({ left, right, reason });
    }
  }

  const groupedIndexes = new Map<number, number[]>();
  for (let index = 0; index < uniqueTickets.length; index += 1) {
    const root = find(index);
    groupedIndexes.set(root, [...(groupedIndexes.get(root) || []), index]);
  }

  const groups = Array.from(groupedIndexes.values())
    .filter((indexes) => indexes.length > 1)
    .map((indexes) => {
      const indexSet = new Set(indexes);
      const reason = edges.find((edge) => indexSet.has(edge.left) && indexSet.has(edge.right))?.reason || "ข้อความและตำแหน่งคล้ายกัน";
      return {
        ticketIds: indexes.map((index) => uniqueTickets[index].ticket_id),
        reason
      };
    })
    .sort((left, right) => right.ticketIds.length - left.ticketIds.length || left.ticketIds[0].localeCompare(right.ticketIds[0]));

  return {
    groupCount: groups.length,
    ticketCount: groups.reduce((sum, group) => sum + group.ticketIds.length, 0),
    examples: groups.slice(0, EXAMPLE_LIMIT)
  };
}

function getDepartmentSuggestion(ticket: DataQualityTicket): DepartmentSuggestionExample | null {
  if (!ticket.ticket_id || ticket.dept_list.length > 0) return null;

  const searchableText = normalizeComparableText([ticket.type, ticket.comment, ticket.hashtag].filter(Boolean).join(" "));
  if (!searchableText) return null;

  const scoredRules = departmentRules
    .map((rule) => {
      const matchedKeywords = rule.keywords.filter(({ keyword }) => searchableText.includes(normalizeComparableText(keyword)));
      return {
        category: rule.category,
        score: matchedKeywords.reduce((sum, keyword) => sum + keyword.weight, 0),
        matchedKeywords: matchedKeywords.map(({ keyword }) => keyword)
      };
    })
    .filter((result) => result.score >= 2)
    .sort((left, right) => right.score - left.score || left.category.localeCompare(right.category, "th"));

  if (scoredRules.length === 0 || (scoredRules[1] && scoredRules[0].score === scoredRules[1].score)) return null;

  return {
    ticketId: ticket.ticket_id,
    category: scoredRules[0].category,
    matchedKeywords: scoredRules[0].matchedKeywords.slice(0, 3)
  };
}

function getAttentionHint(ticket: DataQualityTicket): AttentionHintExample | null {
  if (!ticket.ticket_id) return null;

  const searchableText = normalizeComparableText([ticket.type, ticket.comment, ticket.hashtag].filter(Boolean).join(" "));
  const urgentMatches = urgentAttentionKeywords.filter((keyword) => searchableText.includes(normalizeComparableText(keyword)));

  if (urgentMatches.length > 0) {
    return {
      ticketId: ticket.ticket_id,
      level: "urgent",
      label: "ควรเร่งตรวจสอบ",
      matchedKeywords: urgentMatches.slice(0, 3)
    };
  }

  const reviewMatches = reviewAttentionKeywords.filter((keyword) => searchableText.includes(normalizeComparableText(keyword)));
  if (reviewMatches.length === 0) return null;

  return {
    ticketId: ticket.ticket_id,
    level: "review",
    label: "ควรพิจารณาติดตาม",
    matchedKeywords: reviewMatches.slice(0, 3)
  };
}

export function analyzeDataQualitySignals(tickets: DataQualityTicket[]): DataQualitySignals {
  const duplicateSummary = buildSemanticDuplicateSummary(tickets);
  const departmentSuggestions = tickets.map(getDepartmentSuggestion).filter(Boolean) as DepartmentSuggestionExample[];
  const attentionHints = tickets.map(getAttentionHint).filter(Boolean) as AttentionHintExample[];
  const sortedAttentionHints = [...attentionHints].sort((left, right) => {
    if (left.level !== right.level) return left.level === "urgent" ? -1 : 1;
    return left.ticketId.localeCompare(right.ticketId);
  });

  return {
    semanticDuplicateGroupCount: duplicateSummary.groupCount,
    semanticDuplicateTicketCount: duplicateSummary.ticketCount,
    semanticDuplicateExamples: duplicateSummary.examples,
    departmentSuggestionCount: departmentSuggestions.length,
    departmentSuggestionExamples: departmentSuggestions.slice(0, EXAMPLE_LIMIT),
    urgentAttentionCount: attentionHints.filter((hint) => hint.level === "urgent").length,
    reviewAttentionCount: attentionHints.filter((hint) => hint.level === "review").length,
    attentionExamples: sortedAttentionHints.slice(0, EXAMPLE_LIMIT)
  };
}
