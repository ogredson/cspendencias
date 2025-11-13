import { viewMount } from './ui.js';
import { getSupabase } from '../supabaseClient.js';

function metricCard(title, value) {
  return `<div class="card"><h3>${title}</h3><div class="metric">${value}</div></div>`;
}

export async function render() {
  const v = viewMount();
  v.innerHTML = `
    <div class="grid">
      <div class="col-3" id="mTotal"></div>
      <div class="col-3" id="mAndamento"></div>
      <div class="col-3" id="mResolvidas"></div>
      <div class="col-3" id="mPendentes"></div>
      <div class="col-12 card" id="ultimas">
        <h3>Últimas pendências</h3>
        <table class="table" id="ultimasTable">
          <thead><tr>
            <th>ID</th><th>Cliente</th><th>Tipo</th><th>Técnico</th><th>Status</th><th>Data</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

  const supabase = getSupabase();
  const { data: clientes } = await supabase.from('clientes').select('id_cliente, nome');
  const clienteMap = Object.fromEntries((clientes || []).map(c => [c.id_cliente, c.nome]));
  const total = await supabase.from('pendencias').select('*', { count: 'exact', head: true });
  const andamento = await supabase.from('pendencias').select('*', { count: 'exact', head: true }).eq('status', 'Em Andamento');
  const resolvidas = await supabase.from('pendencias').select('*', { count: 'exact', head: true }).eq('status', 'Resolvido');
  const pendentes = await supabase.from('pendencias').select('*', { count: 'exact', head: true }).eq('status', 'Pendente');

  document.getElementById('mTotal').innerHTML = metricCard('Total', total.count ?? 0);
  document.getElementById('mAndamento').innerHTML = metricCard('Em andamento', andamento.count ?? 0);
  document.getElementById('mResolvidas').innerHTML = metricCard('Resolvidas', resolvidas.count ?? 0);
  document.getElementById('mPendentes').innerHTML = metricCard('Pendentes', pendentes.count ?? 0);

  const { data: ultimas } = await supabase
    .from('pendencias')
    .select('id, cliente_id, tipo, tecnico, status, data_relato')
    .order('created_at', { ascending: false })
    .limit(10);

  const tbody = v.querySelector('#ultimasTable tbody');
  tbody.innerHTML = (ultimas || []).map(row => `
    <tr>
      <td>${row.id}</td>
      <td>${clienteMap[row.cliente_id] ?? row.cliente_id ?? ''}</td>
      <td>${row.tipo}</td>
      <td>${row.tecnico}</td>
      <td><span class="status ${row.status}" aria-label="${row.status}">${row.status}</span></td>
      <td>${row.data_relato ?? ''}</td>
    </tr>
  `).join('');
}