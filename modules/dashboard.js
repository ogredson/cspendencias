import { viewMount } from './ui.js';
import { formatDateBr } from '../utils/validation.js';
import { getSupabase } from '../supabaseClient.js';
import { session } from '../utils/session.js';

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
        <h3>Aguardando aceite</h3>
        <table class="table" id="ultimasTable">
          <thead><tr>
            <th>ID</th><th>Cliente</th><th>Tipo</th><th class="col-tech-relato">Téc. Relato</th><th class="col-tech-resp">Responsável</th><th>Status</th><th>Data</th>
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
  const triagem = await supabase.from('pendencias').select('*', { count: 'exact', head: true }).eq('status', 'Triagem');
  const aguardCliente = await supabase.from('pendencias').select('*', { count: 'exact', head: true }).eq('status', 'Aguardando o Cliente');
  const pendentesCount = (triagem.count ?? 0) + (aguardCliente.count ?? 0);

  document.getElementById('mTotal').innerHTML = metricCard('Total', total.count ?? 0);
  document.getElementById('mAndamento').innerHTML = metricCard('Em andamento', andamento.count ?? 0);
  document.getElementById('mResolvidas').innerHTML = metricCard('Resolvidas', resolvidas.count ?? 0);
  document.getElementById('mPendentes').innerHTML = metricCard('Pendentes', pendentesCount);

  // Aguardando aceite: visão baseada na função do usuário
  const me = session.get()?.nome || '';
  let minhas = [];
  let funcao = null;
  if (me) {
    const { data: userRec } = await supabase.from('usuarios').select('funcao').eq('nome', me).maybeSingle();
    funcao = userRec?.funcao || null;
  }
  const isGestor = ['Adm','Supervisor','Gerente'].includes(String(funcao));
  if (isGestor) {
    const { data } = await supabase
      .from('pendencias')
      .select('id, cliente_id, tipo, tecnico, status, data_relato, pendencia_triagem(tecnico_relato)')
      .eq('status', 'Aguardando Aceite')
      .order('created_at', { ascending: false })
      .limit(50);
    minhas = data || [];
  } else if (me) {
    const { data: triList } = await supabase
      .from('pendencia_triagem')
      .select('pendencia_id')
      .eq('tecnico_triagem', me);
    const ids = (triList || []).map(t => t.pendencia_id);
    if (ids.length) {
      const { data } = await supabase
        .from('pendencias')
        .select('id, cliente_id, tipo, tecnico, status, data_relato, pendencia_triagem(tecnico_relato)')
        .in('id', ids)
        .eq('status', 'Aguardando Aceite')
        .order('created_at', { ascending: false })
        .limit(50);
      minhas = data || [];
    } else {
      minhas = [];
    }
  }

  const tbody = v.querySelector('#ultimasTable tbody');
  if (!minhas || minhas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">Nenhuma pendência aguardando aceite</td></tr>`;
  } else {
    tbody.innerHTML = (minhas || []).map(row => `
      <tr>
        <td><a href="#/pendencia?id=${row.id}" class="link">${row.id}</a></td>
        <td>${clienteMap[row.cliente_id] ?? row.cliente_id ?? ''}</td>
        <td>${row.tipo}</td>
        <td class="col-tech-relato">${Array.isArray(row.pendencia_triagem) ? (row.pendencia_triagem[0]?.tecnico_relato ?? '') : (row.pendencia_triagem?.tecnico_relato ?? '')}</td>
        <td class="col-tech-resp">${row.tecnico}</td>
        <td><span class="status ${row.status}" aria-label="${row.status}">${row.status}</span></td>
        <td>${formatDateBr(row.data_relato)}</td>
      </tr>
    `).join('');
  }
}