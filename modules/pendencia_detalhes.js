import { viewMount } from './ui.js';
import { getSupabase } from '../supabaseClient.js';

function getIdFromHash() {
  const qs = (location.hash.split('?')[1] || '');
  const params = new URLSearchParams(qs);
  return params.get('id');
}

function statusBadge(s) {
  return `<span class="status ${s}" aria-label="${s}">${s}</span>`;
}

export async function render() {
  const v = viewMount();
  const id = getIdFromHash();
  if (!id) { v.innerHTML = `<div class="card"><div class="hint">ID não informado.</div></div>`; return; }
  const supabase = getSupabase();
  const [{ data: pend }, { data: tri }, { data: hist }, { data: chk }, { data: usuarios }] = await Promise.all([
    supabase.from('pendencias').select('*').eq('id', id).maybeSingle(),
    supabase.from('pendencia_triagem').select('*').eq('pendencia_id', id).maybeSingle(),
    supabase.from('pendencia_historicos').select('*').eq('pendencia_id', id).order('created_at', { ascending: false }),
    supabase.from('pendencia_checklists').select('*').eq('pendencia_id', id),
    supabase.from('usuarios').select('nome').eq('ativo', true).order('nome')
  ]);

  const triagemSel = (usuarios || []).map(u => `<option value="${u.nome}">${u.nome}</option>`).join('');
  const chkStatus = (chk || []).map(c => `<li>${c.item}: ${c.checked ? 'OK' : 'Pendente'}</li>`).join('');
  const timeline = (hist || []).map(h => `
    <div class="timeline-item">
      <div class="timeline-title">${h.acao}</div>
      <div class="timeline-meta">${h.usuario} • ${new Date(h.created_at).toLocaleString()}</div>
      ${h.campo_alterado ? `<div class="timeline-detail">${h.campo_alterado}: ${h.valor_anterior ?? ''} → ${h.valor_novo ?? ''}</div>` : ''}
    </div>
  `).join('');

  v.innerHTML = `
    <div class="grid">
      <div class="col-6">
        <div class="card">
          <h3>Pendência ${pend?.id || ''}</h3>
          <div class="hint">${statusBadge(pend?.status || '')}</div>
          <div><b>Cliente:</b> ${pend?.cliente_id ?? ''}</div>
          <div><b>Tipo:</b> ${pend?.tipo}</div>
          <div><b>Técnico:</b> ${pend?.tecnico}</div>
          <div><b>Prioridade:</b> ${pend?.prioridade}</div>
          <div><b>Data do relato:</b> ${pend?.data_relato ?? ''}</div>
        </div>
        <div class="card">
          <h3>Checklist</h3>
          <ul>${chkStatus}</ul>
        </div>
      </div>
      <div class="col-6">
        <div class="card">
          <h3>Controle de Fluxo</h3>
          <div><b>Técnico do Relato:</b> ${tri?.tecnico_relato ?? pend?.tecnico ?? ''}</div>
          <div class="field">
            <label>Técnico de Triagem</label>
            <select id="triagemSel" class="input"><option value="">Selecione...</option>${triagemSel}</select>
            <div class="toolbar" style="margin-top:8px">
              <button class="btn" id="btnDesignar">Designar para triagem</button>
            </div>
          </div>
          <div class="toolbar" style="margin-top:8px">
            <button class="btn success" id="btnAceitar">Aceitar Resolução</button>
            <button class="btn danger" id="btnRejeitar">Rejeitar</button>
          </div>
        </div>
        <div class="card">
          <h3>Histórico</h3>
          <div class="timeline">${timeline}</div>
        </div>
      </div>
    </div>
  `;

  // Actions
  document.getElementById('btnDesignar').addEventListener('click', async () => {
    const nome = document.getElementById('triagemSel').value;
    if (!nome) return;
    const { error: e1 } = await supabase.from('pendencia_triagem').update({ tecnico_triagem: nome, data_triagem: new Date().toISOString() }).eq('pendencia_id', id);
    if (e1) { alert('Erro designar: ' + e1.message); return; }
    const { error: e2 } = await supabase.from('pendencias').update({ status: 'Aguardando Aceite' }).eq('id', id);
    if (e2) { alert('Erro status: ' + e2.message); return; }
    render();
  });

  document.getElementById('btnAceitar').addEventListener('click', async () => {
    const resp = tri?.tecnico_triagem || (usuarios?.[0]?.nome);
    if (!resp) { alert('Defina um Técnico de Triagem antes.'); return; }
    const { error: e1 } = await supabase.from('pendencia_triagem').update({ tecnico_responsavel: resp, data_aceite: new Date().toISOString() }).eq('pendencia_id', id);
    if (e1) { alert('Erro aceite: ' + e1.message); return; }
    const { error: e2 } = await supabase.from('pendencias').update({ status: 'Em Andamento', tecnico: resp }).eq('id', id);
    if (e2) { alert('Erro status: ' + e2.message); return; }
    render();
  });

  document.getElementById('btnRejeitar').addEventListener('click', async () => {
    const motivo = prompt('Motivo da rejeição:');
    if (!motivo) return;
    const { error: e1 } = await supabase.from('pendencia_triagem').update({ data_rejeicao: new Date().toISOString(), motivo_rejeicao: motivo }).eq('pendencia_id', id);
    if (e1) { alert('Erro rejeição: ' + e1.message); return; }
    const { error: e2 } = await supabase.from('pendencias').update({ status: 'Rejeitada' }).eq('id', id);
    if (e2) { alert('Erro status: ' + e2.message); return; }
    render();
  });
}