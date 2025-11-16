import { viewMount } from './ui.js';
import { getSupabase, supabaseReady } from '../supabaseClient.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, TRELLO_KEY, TRELLO_TOKEN } from '../config.js';

function toCSV(rows) {
  if (!rows?.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = v => String(v ?? '').replace(/"/g, '""');
  const lines = [headers.join(',')].concat(rows.map(r => headers.map(h => `"${escape(r[h])}"`).join(',')));
  return lines.join('\n');
}

function download(name, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export async function render() {
  const v = viewMount();
  const localCfgLoaded = typeof window !== 'undefined' && Boolean(window.__CONFIG__);
  const supaOk = Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);
  const trelloOk = Boolean(TRELLO_KEY) && Boolean(TRELLO_TOKEN);
  v.innerHTML = `
    <div class="grid">
      <div class="col-6 card">
        <h3>Backup de dados</h3>
        <div class="toolbar">
          <button class="btn" id="expPendencias">Exportar pendências</button>
          <button class="btn" id="expClientes">Exportar clientes</button>
          <button class="btn" id="expModulos">Exportar módulos</button>
        </div>
        <div class="hint">Gera arquivos CSV compatíveis com Excel.</div>
      </div>
      <div class="col-6 card">
        <h3>Configurações</h3>
        <div class="notice">Segredos são lidos de <code>config.local.js</code> (não versionado).</div>
        <ul>
          <li>Status arquivo local: <strong>${localCfgLoaded ? 'carregado' : 'não encontrado'}</strong></li>
          <li>Supabase: <strong>${supaOk ? 'OK' : 'faltando chaves'}</strong> ${supabaseReady() ? '' : '<span class="hint">Defina <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code>.</span>'}</li>
          <li>Trello: <strong>${trelloOk ? 'OK' : 'faltando chaves'}</strong> ${trelloOk ? '' : '<span class="hint">Defina <code>TRELLO_KEY</code> e <code>TRELLO_TOKEN</code>.</span>'}</li>
        </ul>
        <div class="divider"></div>
        <h4>Como configurar</h4>
        <p>Crie <code>config.local.js</code> na raiz com este conteúdo:</p>
        <pre style="white-space:pre-wrap; background: var(--bg-muted); padding:8px; border-radius:6px;"><code>window.__CONFIG__ = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "SEU-ANON-KEY",
  TRELLO_KEY: "SEU-TRELLO-KEY",
  TRELLO_TOKEN: "SEU-TRELLO-TOKEN"
};</code></pre>
        <div class="hint">Este arquivo é ignorado pelo Git em <code>.gitignore</code>. Não versione segredos.</div>
      </div>
    </div>
  `;

  const supabase = getSupabase();

  document.getElementById('expPendencias').addEventListener('click', async () => {
    const { data } = await supabase.from('pendencias').select('*');
    download('pendencias.csv', toCSV(data || []));
  });
  document.getElementById('expClientes').addEventListener('click', async () => {
    const { data } = await supabase.from('clientes').select('*');
    download('clientes.csv', toCSV(data || []));
  });
  document.getElementById('expModulos').addEventListener('click', async () => {
    const { data } = await supabase.from('modulos').select('*');
    download('modulos.csv', toCSV(data || []));
  });
}