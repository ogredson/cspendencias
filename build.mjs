// Gera config.local.js a partir de variáveis de ambiente (Vercel/CI)
// Uso: `node build.mjs`
import fs from 'fs';

const cfg = {
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  TRELLO_KEY: process.env.TRELLO_KEY || '',
  TRELLO_TOKEN: process.env.TRELLO_TOKEN || '',
  WHATSAPP_API_TOKEN: process.env.WHATSAPP_API_TOKEN || '',
};

const content = `window.__CONFIG__ = ${JSON.stringify(cfg, null, 2)};\n`;
fs.writeFileSync('config.local.js', content);
console.log('config.local.js gerado com chaves:', Object.keys(cfg).filter(k => cfg[k]).join(', ') || '(nenhuma)');