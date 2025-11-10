export function sanitizeText(v) { return String(v ?? '').trim(); }
export function validDateStr(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v)); }
export function toDate(v) { return validDateStr(v) ? v : null; }