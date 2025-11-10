export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const obj = JSON.parse(raw);
      if (obj && obj.ttl && Date.now() > obj.ttl) {
        localStorage.removeItem(key);
        return fallback;
      }
      return obj?.value ?? fallback;
    } catch { return fallback; }
  },
  set(key, value, ttlMs = 10 * 60 * 1000) {
    const obj = { value, ttl: Date.now() + ttlMs };
    localStorage.setItem(key, JSON.stringify(obj));
  },
};