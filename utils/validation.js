export function sanitizeText(v) { return String(v ?? '').trim(); }
export function validDateStr(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v)); }
export function toDate(v) { return validDateStr(v) ? v : null; }
export function formatDateBr(v) {
  if (!v) return '';
  const s = String(v);
  if (validDateStr(s)) {
    const [y, m, d] = s.split('-');
    return `${d}-${m}-${y}`;
  }
  const d = new Date(s);
  if (isNaN(d)) return s;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}`;
}

export function formatDateTimeBr(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${date} ${time}`;
}