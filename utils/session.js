export const session = {
  get() {
    try { const v = localStorage.getItem('session_user'); return v ? JSON.parse(v) : null; } catch { return null; }
  },
  set(user) {
    try { localStorage.setItem('session_user', JSON.stringify(user)); } catch {}
  },
  clear() { try { localStorage.removeItem('session_user'); } catch {} }
};