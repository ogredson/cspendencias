import { viewMount } from './ui.js';
import { getSupabase } from '../supabaseClient.js';

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
        <div class="notice">As credenciais Supabase são definidas em <code>config.js</code>.</div>
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