// Configuração central de credenciais.
// NUNCA versione segredos aqui. Use `config.local.js` (não versionado).
// Se `config.local.js` existir, ele deve definir `window.__CONFIG__ = { ... }`.
// Estes exports usam os valores de `window.__CONFIG__` quando presentes.
const localCfg = typeof window !== 'undefined' && window.__CONFIG__ ? window.__CONFIG__ : {};

export const SUPABASE_URL = localCfg.SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = localCfg.SUPABASE_ANON_KEY ?? "";
export const TRELLO_KEY = localCfg.TRELLO_KEY ?? "";
export const TRELLO_TOKEN = localCfg.TRELLO_TOKEN ?? "";
export const WHATSAPP_API_TOKEN = localCfg.WHATSAPP_API_TOKEN ?? "";