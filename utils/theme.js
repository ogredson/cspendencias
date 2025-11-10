export const theme = {
  get() { try { return localStorage.getItem('theme') || 'dark'; } catch { return 'dark'; } },
  set(v) { try { localStorage.setItem('theme', v); } catch {} }
};