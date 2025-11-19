// topo: imports
import { viewMount, confirmDialog, openModal } from './ui.js';
import { TRELLO_KEY, TRELLO_TOKEN, WHATSAPP_API_TOKEN } from '../config.js';
import { storage } from '../utils/storage.js';
import { getSupabase } from '../supabaseClient.js';
import { session } from '../utils/session.js';
import { debounce } from '../utils/debounce.js';
import { formatDateBr, formatDateTimeBr } from '../utils/validation.js';

// Helper: salva triagem sem depender de ON CONFLICT (índice único)
async function saveTriagemNoConflict(supabase, pendenciaId, patch) {
  const { data: existing } = await supabase
    .from('pendencia_triagem')
    .select('pendencia_id')
    .eq('pendencia_id', pendenciaId)
    .maybeSingle();
  if (existing) {
    return await supabase
      .from('pendencia_triagem')
      .update(patch)
      .eq('pendencia_id', pendenciaId);
  }
  return await supabase
    .from('pendencia_triagem')
    .insert({ pendencia_id: pendenciaId, ...patch });
}

function getIdFromHash() {
  const qs = (location.hash.split('?')[1] || '');
  const params = new URLSearchParams(qs);
  return params.get('id');
}

function statusBadge(s) {
  return `<span class="status ${s}" aria-label="${s}">${s}</span>`;
}

// Formata ID como 'ID-00080' mesmo se já vier 'ID-00080'
function formatPendId(id) {
  const s = String(id ?? '');
  const raw = s.replace(/^ID-/, '');
  return 'ID-' + String(raw).padStart(5, '0');
}

export async function render() {
  const v = viewMount();
  const id = getIdFromHash();
  if (!id) { v.innerHTML = `<div class="card"><div class="hint">ID não informado.</div></div>`; return; }
  const supabase = getSupabase();
    const [{ data: pend }, { data: tri }, { data: hist }, { data: usuarios }, { data: clientes }, { data: modulos }] = await Promise.all([
      supabase.from('pendencias').select('*').eq('id', id).maybeSingle(),
      supabase.from('pendencia_triagem').select('*').eq('pendencia_id', id).maybeSingle(),
      supabase.from('pendencia_historicos').select('*').eq('pendencia_id', id).order('created_at', { ascending: false }),
      supabase.from('usuarios').select('nome, fone_celular').eq('ativo', true).order('nome'),
      supabase.from('clientes').select('id_cliente, nome'),
      supabase.from('modulos').select('id, nome').order('id')
    ]);

  const triagemSel = (usuarios || []).map(u => `<option value="${u.nome}">${u.nome}</option>`).join('');

  // helpers para histórico e formatação
const fmt = (dt) => formatDateTimeBr(dt);
  const sanitizeText = (s) => String(s ?? '').replace(/[&<>\"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[ch]));
  const findByAction = (arr, needle) => (arr || []).find(h => String(h.acao || '').toLowerCase().includes(needle));
  const histDesignado = findByAction(hist, 'designado para triagem');
  const histAnalise = findByAction(hist, 'análise');
  const histAceito = findByAction(hist, 'aceita para resolução');
  const histRejeitada = findByAction(hist, 'rejeitad');
  const histResolvida = findByAction(hist, 'resolvid');

  // Mapeia cores por status para a barra superior
  const getStatusColor = (s) => {
    const map = {
      'Triagem': '#6B7280',
      'Aguardando Aceite': '#D97706',
      'Em Analise': '#2563EB',
      'Em Andamento': '#0EA5E9',
      'Aguardando o Cliente': '#EAB308',
      'Em Teste': '#9333EA',
      'Resolvido': '#10B981',
      'Rejeitada': '#EF4444',
    };
    return map[String(s)] || '#607D8B';
  };

  const statusDetail = (() => {
    const s = String(pend?.status || '');
    if (s === 'Triagem') return 'Aguardando designação para triagem.';
    if (s === 'Aguardando Aceite') {
      const quem = tri?.tecnico_triagem ?? '—';
      const quando = fmt(tri?.data_triagem) || fmt(histDesignado?.created_at);
      return `Aguardando aceite de: ${quem}${quando ? ` • desde: ${quando}` : ''}`;
    }
    if (s === 'Em Analise') {
      const quem = tri?.tecnico_triagem ?? histAnalise?.usuario ?? '—';
      const quando = fmt(tri?.data_aceite) || fmt(histAnalise?.created_at);
      return `Em análise por: ${quem}${quando ? ` • desde: ${quando}` : ''}`;
    }
    if (s === 'Em Andamento') {
      const quem = tri?.tecnico_responsavel ?? histAceito?.usuario ?? '—';
      const quando = fmt(tri?.data_aceite) || fmt(histAceito?.created_at);
      return `Aceita para resolução por: ${quem}${quando ? ` • em: ${quando}` : ''}`;
    }
    if (s === 'Aguardando o Cliente') {
      return 'Aguardando resposta do cliente.';
    }
    if (s === 'Em Teste') {
      const quem = tri?.tecnico_responsavel ?? session.get()?.nome ?? '—';
      return `Em validação/testes por: ${quem}`;
    }
    if (s === 'Rejeitada') {
      const quem = histRejeitada?.usuario ?? tri?.tecnico_triagem ?? '—';
      const quando = fmt(tri?.data_rejeicao) || fmt(histRejeitada?.created_at);
      const motivo = tri?.motivo_rejeicao ?? '—';
      return `Rejeitada por: ${quem}${quando ? ` • em: ${quando}` : ''} • Motivo: ${motivo}`;
    }
    if (s === 'Resolvido') {
      const quem = histResolvida?.usuario ?? pend?.tecnico ?? tri?.tecnico_responsavel ?? '—';
      const quando = fmt(histResolvida?.created_at);
      return `Resolvida por: ${quem}${quando ? ` • em: ${quando}` : ''}`;
    }
    return '';
  })();

  // Estado e helpers para histórico (filtro + paginação)
  const histAsc = (hist || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  let histFilterText = '';
  let histPageSize = 10;
  let histCurrentPage = 1;
  const applyHistFilter = (arr, term) => {
    if (!term) return arr;
    const t = String(term).toLowerCase();
    return arr.filter(h => (
      String(h.usuario || '').toLowerCase().includes(t) ||
      String(h.acao || '').toLowerCase().includes(t) ||
      String(h.campo_alterado || '').toLowerCase().includes(t) ||
      String(h.valor_anterior || '').toLowerCase().includes(t) ||
      String(h.valor_novo || '').toLowerCase().includes(t)
    ));
  };
  const renderHistTable = () => {
    const filtered = applyHistFilter(histAsc, histFilterText);
    const sortedDesc = filtered.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = sortedDesc.length;
    const maxPage = Math.max(1, Math.ceil(total / histPageSize));
    if (histCurrentPage > maxPage) histCurrentPage = maxPage;
    const startIdx = (histCurrentPage - 1) * histPageSize;
    const pageItems = sortedDesc.slice(startIdx, startIdx + histPageSize);
    const rows = pageItems.map(h => {
      const ac = String(h.acao || '').toLowerCase();
      const isAnalise = ac.includes('aceita para análise') || ac.includes('aceita para analise');
      const isResolucao = ac.includes('aceita para resolução') || ac.includes('aceita para resolucao');
      const isRejeitada = ac.includes('rejeitad');
      const cls = isAnalise ? 'status-change status-analise' : isResolucao ? 'status-change status-resolucao' : isRejeitada ? 'status-change status-rejeitada' : '';
      return `
      <tr class="${cls}">
        <td>${formatDateTimeBr(h.created_at)}</td>
        <td>${h.usuario ?? ''}</td>
        <td>${h.acao ?? ''}</td>
        <td>${h.campo_alterado ?? ''}</td>
        <td>${h.valor_anterior ?? ''}</td>
        <td>${h.valor_novo ?? ''}</td>
      </tr>
      `;
    }).join('');
    const tbody = document.getElementById('histTbody');
    if (tbody) tbody.innerHTML = rows;
    const info = document.getElementById('histPageInfo');
    if (info) info.textContent = `${total === 0 ? 0 : (startIdx + 1)}–${Math.min(startIdx + histPageSize, total)} de ${total}`;
    const prev = document.getElementById('histPrev');
    const next = document.getElementById('histNext');
    if (prev) prev.disabled = histCurrentPage <= 1;
    if (next) next.disabled = histCurrentPage >= maxPage;
  };

  // seção adaptativa por tipo
  let detalhesHtml = '';
  if (pend?.tipo === 'Programação' || pend?.tipo === 'Suporte') {
    detalhesHtml = `
      <div class="card">
        <div class="section-head primary">📋 Programação & Suporte</div>
        <table class="table details-table" style="margin-top:8px;">
          <tbody>
            <tr><th>Situação:</th><td class="pre">${pend?.situacao ?? 'Não informado'}</td></tr>
            <tr><th>Etapas:</th><td class="pre">${pend?.etapas_reproducao ?? 'Não informado'}</td></tr>
            <tr><th>Frequência:</th><td>${pend?.frequencia ?? 'Não informado'}</td></tr>
            <tr><th>Informações:</th><td class="pre">${pend?.informacoes_adicionais ?? 'Não informado'}</td></tr>
          </tbody>
        </table>
      </div>`;
  } else if (pend?.tipo === 'Implantação') {
    detalhesHtml = `
      <div class="card">
        <div class="section-head info">🚀 Implantação</div>
        <table class="table details-table" style="margin-top:8px;">
          <tbody>
            <tr><th>Escopo:</th><td class="pre">${pend?.escopo ?? 'Não informado'}</td></tr>
            <tr><th>Objetivo:</th><td class="pre">${pend?.objetivo ?? 'Não informado'}</td></tr>
            <tr><th>Recursos:</th><td class="pre">${pend?.recursos_necessarios ?? 'Não informado'}</td></tr>
            <tr><th>Informações:</th><td class="pre">${pend?.informacoes_adicionais ?? 'Não informado'}</td></tr>
          </tbody>
        </table>
      </div>`;
  } else if (pend?.tipo === 'Atualizacao') {
    detalhesHtml = `
      <div class="card">
        <div class="section-head primary">🔄 Atualização</div>
        <table class="table details-table" style="margin-top:8px;">
          <tbody>
            <tr><th>Escopo:</th><td class="pre">${pend?.escopo ?? 'Não informado'}</td></tr>
            <tr><th>Motivação:</th><td class="pre">${pend?.objetivo ?? 'Não informado'}</td></tr>
            <tr><th>Impacto:</th><td class="pre">${pend?.informacoes_adicionais ?? 'Não informado'}</td></tr>
            <tr><th>Requisitos específicos:</th><td class="pre">${pend?.recursos_necessarios ?? 'Não informado'}</td></tr>
          </tbody>
        </table>
      </div>`;
  } else if (pend?.tipo === 'Outro') {
    detalhesHtml = `
      <div class="card">
        <div class="section-head neutral">🧩 Outra Pendência</div>
        <table class="table details-table" style="margin-top:8px;">
          <tbody>
            <tr><th>Situação:</th><td class="pre">${pend?.situacao ?? 'Não informado'}</td></tr>
          </tbody>
        </table>
      </div>`;
  }

  v.innerHTML = `
    <div class="grid">
      <div class="col-6">
        <div class="card">
          <h3 class="title-accent">Pendência: ${pend?.id ? formatPendId(pend.id) : ''}</h3>
          <div style="background:${getStatusColor(pend?.status)}; color:#fff; padding:6px 10px; border-radius:4px; font-size:12px; margin-bottom:8px;">
            <div style="font-weight:600">${pend?.status || ''}</div>
            <div>${statusDetail}</div>
          </div>

          <!-- Título agora logo abaixo da barra de status -->
          <div class="pend-title ${pend?.prioridade === 'Critica' ? 'critical' : ''}">
            <b>Título:</b> <span>${pend?.descricao ?? ''}</span>
          </div>

          <!-- Tabela de detalhes para simetria -->
          <table class="table details-table" style="margin-top:8px;">
            <tbody>
              <tr>
                <th>Cliente:</th>
                <td>${(clientes || []).find(c => c.id_cliente === pend?.cliente_id)?.nome ?? pend?.cliente_id ?? ''}</td>
              </tr>
              <tr>
                <th>Tipo:</th>
                <td>${pend?.tipo ?? '—'}</td>
              </tr>
              <tr>
                <th>Técnico:</th>
                <td>${pend?.tecnico ?? '—'}</td>
              </tr>
              <tr>
                <th>Prioridade:</th>
                <td><span class="prio ${pend?.prioridade}" aria-label="${pend?.prioridade}">${pend?.prioridade}</span></td>
              </tr>
              <tr>
                <th>Data do relato:</th>
                <td>${formatDateBr(pend?.data_relato)}</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
            ${pend?.link_trello ? `<a class="btn" href="${pend.link_trello}" target="_blank" rel="noopener">Abrir no Trello</a>` : ''}
            <button class="btn trello" id="btnTrello">Gerar Card Trello</button>
            ${pend?.link_trello ? `<button class="btn" id="btnVerCard">Ver Card Trello</button>` : ''}
            <button class="btn warning" id="btnNotifyTech">Notificar Técnico</button>
          </div>
        </div>

        <div class="card">
          <div class="section-head warning">Controle de Fluxo</div>
          <div><b>Técnico do Relato:</b> ${tri?.tecnico_relato ?? pend?.tecnico ?? ''}</div>
          <div class="field">
            <label>Técnico de Triagem</label>
            <div style="display:flex; gap:8px; align-items:center;">
              <select id="triagemSel" class="input" style="flex:1"><option value="">Selecione...</option>${triagemSel}</select>
              <button class="btn warning" id="btnDesignar">Designar para triagem</button>
            </div>
          </div>
          <div class="toolbar" style="margin-top:8px">
            <button class="btn primary" id="btnAnalise">Aceitar Análise</button>
            <button class="btn success" id="btnAceitar">Aceitar Resolução</button>
            <button class="btn test" id="btnTestes">Enviar para Testes</button>
            <button class="btn await" id="btnAguardarCliente">Aguardar Cliente</button>
            <button class="btn danger" id="btnRejeitar">Rejeitar</button>
          </div>
        </div>
        <div class="card">
          <div class="section-head neutral">Histórico</div>
          <div class="toolbar" style="display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
            <input id="histFilter" class="input" placeholder="Filtrar por texto..." style="flex:1; min-width:240px" />
            <button class="btn" id="histClear">Limpar filtro</button>
            <div style="display:flex; align-items:center; gap:8px;">
              <label for="histPageSize">Itens/página</label>
              <select id="histPageSize" class="input">
                <option value="10" selected>10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </div>
            <div style="display:flex; align-items:center; gap:8px; margin-left:auto;">
              <button class="btn" id="histPrev">Anterior</button>
              <span id="histPageInfo" style="font-size:12px; opacity:0.8"></span>
              <button class="btn" id="histNext">Próxima</button>
            </div>
          </div>
          <table class="table" id="histTable">
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Campo</th>
                <th>Antes</th>
                <th>Depois</th>
              </tr>
            </thead>
            <tbody id="histTbody"></tbody>
          </table>
        </div>
      </div>
      <div class="col-6">
        ${detalhesHtml}
        <div class="card" style="border-left:4px solid #10B981; background:#F0FDF4;">
          <div class="section-head success">💡 Solução / Orientação</div>
          <div style="white-space:pre-wrap;">${pend?.solucao_orientacao ? pend.solucao_orientacao : '<span style="opacity:0.7">Não informado</span>'}</div>
        </div>
        <div id="trelloPreviewSlot"></div>
        <div class="card" style="min-height:320px">
          <div class="section-head info">Gráfico Timeline por Status</div>
          <div style="padding:12px;">
            <div id="timelineBar" style="display:flex; gap:4px; height:40px; background:#eee; border-radius:6px; padding:4px;"></div>
            <div id="timelineLegend" style="font-size:12px; margin-top:8px; display:grid; grid-template-columns: repeat(3, 1fr); gap:6px;"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Preselecionar triagista com atual ou usuário logado
  const sel = document.getElementById('triagemSel');
  const currentUser = session.get()?.nome;
  if (tri?.tecnico_triagem && Array.from(sel.options).some(o => o.value === tri.tecnico_triagem)) {
    sel.value = tri.tecnico_triagem;
  } else if (currentUser && Array.from(sel.options).some(o => o.value === currentUser)) {
    sel.value = currentUser;
  }

  // Actions: Designar, Aceitar Análise, Aceitar Resolução, Rejeitar
  document.getElementById('btnDesignar').addEventListener('click', async () => {
    const nome = document.getElementById('triagemSel').value;
    if (!nome) {
      alert('Selecione o Técnico de Triagem.');
      return;
    }
    const ok = await confirmDialog(`Você está prestes a designar a pendência ${id} para triagem de ${nome}.`);
    if (!ok) return;
    const { error: e1 } = await saveTriagemNoConflict(supabase, id, { tecnico_triagem: nome, data_triagem: new Date().toISOString() });
    if (e1) { alert('Erro designar: ' + e1.message); return; }
    const { error: e2 } = await supabase.from('pendencias').update({ status: 'Aguardando Aceite' }).eq('id', id);
    if (e2) { alert('Erro status: ' + e2.message); return; }
    // Histórico do status alterado para "Aguardando Aceite"
    await supabase.from('pendencia_historicos').insert({
      pendencia_id: id,
      acao: 'Status alterado para Aguardando Aceite',
      usuario: session.get()?.nome || nome,
      campo_alterado: 'status',
      valor_anterior: pend?.status ?? null,
      valor_novo: 'Aguardando Aceite'
    });
    render();
  });

  // Trello: gerar card
  const btnTrello = document.getElementById('btnTrello');
  if (btnTrello) btnTrello.addEventListener('click', async () => {
    const trelloReady = Boolean(TRELLO_KEY) && Boolean(TRELLO_TOKEN);
    const persistTTL = 90 * 24 * 60 * 60 * 1000; // 90 dias
    const clienteNome = (clientes || []).find(c => c.id_cliente === pend?.cliente_id)?.nome ?? pend?.cliente_id ?? '';
    const moduloNome = (modulos || []).find(m => m.id === pend?.modulo_id)?.nome ?? pend?.modulo_id ?? '';
    const cardTitle = `${formatPendId(pend?.id)}: ${pend?.descricao ?? ''}`.trim();
    const responsavelNome = pend?.tecnico || tri?.tecnico_responsavel || tri?.tecnico_relato || session.get()?.nome || '—';
    const buildDesc = () => {
      const linhas = [
        `Cliente: ${clienteNome}`,
        `Módulo: ${moduloNome}`,
        `Tipo: ${pend?.tipo ?? '—'}`,
        `Prioridade: ${pend?.prioridade ?? '—'}`,
        `Status: ${pend?.status ?? '—'}`,
        `Data do relato: ${formatDateBr(pend?.data_relato)}`,
        `Técnico responsável: ${responsavelNome}`,
        '',
        'Título:',
        `${pend?.descricao ?? ''}`,
        '',
      ];

      const tipo = String(pend?.tipo || '').trim();
      if (tipo === 'Programação' || tipo === 'Suporte') {
        linhas.push(
          'Situação:',
          `${pend?.situacao ?? '—'}`,
          '',
          'Etapas:',
          `${pend?.etapas_reproducao ?? '—'}`,
          '',
          'Frequência:',
          `${pend?.frequencia ?? '—'}`,
          '',
          'Informações:',
          `${pend?.informacoes_adicionais ?? '—'}`,
          ''
        );
      } else if (tipo === 'Implantação') {
        linhas.push(
          'Escopo:',
          `${pend?.escopo ?? '—'}`,
          '',
          'Objetivo:',
          `${pend?.objetivo ?? '—'}`,
          '',
          'Recursos:',
          `${pend?.recursos_necessarios ?? '—'}`,
          '',
          'Informações:',
          `${pend?.informacoes_adicionais ?? '—'}`,
          ''
        );
      } else if (tipo === 'Atualizacao') { // sem acento para compatibilidade com base
        linhas.push(
          'Escopo:',
          `${pend?.escopo ?? '—'}`,
          '',
          'Motivação:',
          `${pend?.objetivo ?? '—'}`,
          '',
          'Impacto:',
          `${pend?.informacoes_adicionais ?? '—'}`,
          '',
          'Requisitos específicos:',
          `${pend?.recursos_necessarios ?? '—'}`,
          ''
        );
      } else if (tipo === 'Outro') {
        linhas.push(
          'Situação:',
          `${pend?.situacao ?? '—'}`,
          ''
        );
      }

      linhas.push('Solução/Orientação:', `${pend?.solucao_orientacao ?? '—'}`);
      return linhas.join('\n');
    };
    const initialDesc = buildDesc();

    const m = openModal(`
      <div style="padding:12px;">
        <h3>Gerar Card Trello</h3>
        <div class="notice" style="margin-bottom:12px;">
          Revise os dados e escolha o Board e a Lista onde o card será criado.
        </div>
        <div class="row">
          <div class="col-4 field">
            <label>Área de trabalho</label>
            <select id="trelloOrgSel" class="input"><option value="">${trelloReady ? 'Carregando áreas...' : 'Informe TRELLO_KEY/TRELLO_TOKEN em config.js'}</option></select>
          </div>
          <div class="col-6 field">
            <label>Board</label>
            <select id="trelloBoardSel" class="input"><option value="">${trelloReady ? 'Carregando boards...' : 'Informe TRELLO_KEY/TRELLO_TOKEN em config.js'}</option></select>
          </div>
          <div class="col-6 field">
            <label>Lista</label>
            <select id="trelloListSel" class="input" disabled><option value="">Selecione o board primeiro</option></select>
          </div>
        </div>
        <div class="field">
          <label>Título do Card</label>
          <input id="trelloCardName" class="input" value="${sanitizeText(cardTitle)}" />
        </div>
        <div class="field">
          <label>Descrição</label>
          <textarea id="trelloCardDesc" class="input" style="min-height:140px;">${sanitizeText(initialDesc)}</textarea>
        </div>
        <div class="toolbar" style="justify-content:flex-end; gap:8px;">
          <button class="btn" id="trelloCancel">Cancelar</button>
          <button class="btn trello" id="trelloCreate" ${trelloReady ? '' : 'disabled'}>Criar Card</button>
        </div>
        <div id="trelloMsg" class="hint" style="margin-top:8px;"></div>
      </div>
    `);
    const close = () => { if (typeof m.closeModal === 'function') m.closeModal(); };
    m.querySelector('#trelloCancel').addEventListener('click', close);
    const msgEl = m.querySelector('#trelloMsg');
    const orgSel = m.querySelector('#trelloOrgSel');
    const boardSel = m.querySelector('#trelloBoardSel');
    const listSel = m.querySelector('#trelloListSel');
    const nameEl = m.querySelector('#trelloCardName');
    const descEl = m.querySelector('#trelloCardDesc');

    const safeFetch = async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    };

    if (trelloReady) {
      try {
        msgEl.textContent = 'Carregando áreas de trabalho...';
        const orgs = await safeFetch(`https://api.trello.com/1/members/me/organizations?fields=displayName&key=${encodeURIComponent(TRELLO_KEY)}&token=${encodeURIComponent(TRELLO_TOKEN)}`);
        orgSel.innerHTML = ['<option value="">Selecione...</option>', ...(orgs || []).map(o => `<option value="${o.id}">${sanitizeText(o.displayName || o.name)}</option>`)].join('');
        msgEl.textContent = '';
        orgSel.disabled = false;
        // Preseleciona última área utilizada
        const lastOrg = storage.get('trello_last_org', '');
        if (lastOrg && Array.from(orgSel.options).some(o => o.value === lastOrg)) {
          orgSel.value = lastOrg;
          // Dispara carregamento de boards
          orgSel.dispatchEvent(new Event('change'));
        }
      } catch (err) {
        msgEl.textContent = 'Erro ao carregar áreas: ' + err.message;
      }
      orgSel.addEventListener('change', async () => {
        const idOrg = orgSel.value;
        storage.set('trello_last_org', idOrg, persistTTL);
        boardSel.disabled = true;
        boardSel.innerHTML = '<option value="">Carregando boards...</option>';
        listSel.disabled = true;
        listSel.innerHTML = '<option value="">Selecione o board primeiro</option>';
        if (!idOrg) { boardSel.disabled = true; boardSel.innerHTML = '<option value="">Selecione a área primeiro</option>'; return; }
        try {
          const boards = await safeFetch(`https://api.trello.com/1/organizations/${encodeURIComponent(idOrg)}/boards?fields=name&key=${encodeURIComponent(TRELLO_KEY)}&token=${encodeURIComponent(TRELLO_TOKEN)}`);
          boardSel.innerHTML = ['<option value="">Selecione...</option>', ...(boards || []).map(b => `<option value="${b.id}">${sanitizeText(b.name)}</option>`)].join('');
          boardSel.disabled = false;
          msgEl.textContent = '';
          // Preseleciona último board utilizado
          const lastBoard = storage.get('trello_last_board', '');
          if (lastBoard && Array.from(boardSel.options).some(o => o.value === lastBoard)) {
            boardSel.value = lastBoard;
            // Dispara carregamento de listas
            boardSel.dispatchEvent(new Event('change'));
          }
        } catch (err) {
          msgEl.textContent = 'Erro ao carregar boards: ' + err.message;
        }
      });
      boardSel.addEventListener('change', async () => {
        const idBoard = boardSel.value;
        storage.set('trello_last_board', idBoard, persistTTL);
        listSel.disabled = true;
        listSel.innerHTML = '<option value="">Carregando listas...</option>';
        if (!idBoard) { listSel.disabled = true; listSel.innerHTML = '<option value="">Selecione o board primeiro</option>'; return; }
        try {
          const lists = await safeFetch(`https://api.trello.com/1/boards/${encodeURIComponent(idBoard)}/lists?fields=name&key=${encodeURIComponent(TRELLO_KEY)}&token=${encodeURIComponent(TRELLO_TOKEN)}`);
          listSel.innerHTML = ['<option value="">Selecione...</option>', ...(lists || []).map(l => `<option value="${l.id}">${sanitizeText(l.name)}</option>`)].join('');
          listSel.disabled = false;
          msgEl.textContent = '';
          // Preseleciona última lista utilizada
          const lastList = storage.get('trello_last_list', '');
          if (lastList && Array.from(listSel.options).some(o => o.value === lastList)) {
            listSel.value = lastList;
          }
        } catch (err) {
          msgEl.textContent = 'Erro ao carregar listas: ' + err.message;
        }
      });
      listSel.addEventListener('change', () => {
        storage.set('trello_last_list', listSel.value, persistTTL);
      });
    }

    m.querySelector('#trelloCreate').addEventListener('click', async () => {
      const idList = listSel.value;
      const name = String(nameEl.value || '').trim();
      const desc = String(descEl.value || '').trim();
      if (!trelloReady) { msgEl.textContent = 'Configure TRELLO_KEY e TRELLO_TOKEN em config.js.'; return; }
      if (!idList) { msgEl.textContent = 'Selecione a lista.'; return; }
      if (!name) { msgEl.textContent = 'Informe o título do card.'; return; }
      const ok = await confirmDialog(`Criar card no Trello em "${listSel.options[listSel.selectedIndex]?.text}"?`, { confirmText: 'Criar Card', cancelText: 'Cancelar' });
      if (!ok) return;
      try {
        msgEl.textContent = 'Criando card no Trello...';
        const params = new URLSearchParams({ idList, name, desc, key: TRELLO_KEY, token: TRELLO_TOKEN });
        const resp = await fetch(`https://api.trello.com/1/cards?${params.toString()}`, { method: 'POST' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const card = await resp.json();
        const url = card?.shortUrl || card?.url;
        if (!url) throw new Error('Resposta inesperada do Trello');
        const { error } = await getSupabase().from('pendencias').update({ link_trello: url }).eq('id', id);
        if (error) throw error;
        msgEl.textContent = 'Card criado com sucesso. Link salvo.';
        close();
        render();
      } catch (err) {
        msgEl.textContent = 'Erro ao criar card: ' + err.message;
      }
    });
  });

  document.getElementById('btnAnalise').addEventListener('click', async () => {
    const selVal = document.getElementById('triagemSel').value;
    if (!selVal) { alert('Defina o Técnico de Triagem antes de aceitar análise.'); return; }
    const resp = selVal;
    const ok = await confirmDialog(`Você está prestes a aceitar a análise da pendência ${id} por ${resp}.`);
    if (!ok) return;
    // Aceitar análise: não define tecnico_responsavel para evitar log de "resolução" pelo trigger
    const { error: e1 } = await saveTriagemNoConflict(supabase, id, { tecnico_triagem: tri?.tecnico_triagem || resp, data_aceite: new Date().toISOString() });
    if (e1) { alert('Erro análise: ' + e1.message); return; }
    const { error: e2 } = await supabase.from('pendencias').update({
      status: 'Em Analise', tecnico: resp
    }).eq('id', id);
    if (e2) { alert('Erro status: ' + e2.message); return; }
    // Log claro para análise: mudar status para Em Analise
    await supabase.from('pendencia_historicos').insert({
      pendencia_id: id,
      acao: 'Pendência aceita para análise',
      usuario: session.get()?.nome || resp,
      campo_alterado: 'status',
      valor_anterior: pend?.status ?? null,
      valor_novo: 'Em Analise'
    });
    render();
  });

  document.getElementById('btnAceitar').addEventListener('click', async () => {
    const selVal = document.getElementById('triagemSel').value;
    if (!selVal) { alert('Defina o Técnico de Triagem antes de aceitar resolução.'); return; }
    const resp = selVal;
    const ok = await confirmDialog(`Você está prestes a aceitar a resolução da pendência ${id} por ${resp}.`);
    if (!ok) return;
    const { error: e1 } = await saveTriagemNoConflict(supabase, id, { tecnico_responsavel: resp, data_aceite: new Date().toISOString() });
    if (e1) { alert('Erro aceite: ' + e1.message); return; }
    const { error: e2 } = await supabase.from('pendencias').update({
      status: 'Em Andamento', tecnico: resp
    }).eq('id', id);
    if (e2) { alert('Erro status: ' + e2.message); return; }
    // Evita duplicidade com trigger de triagem; registra só mudança de status
    await supabase.from('pendencia_historicos').insert({
      pendencia_id: id,
      acao: 'Status alterado para Em Andamento',
      usuario: session.get()?.nome || resp,
      campo_alterado: 'status',
      valor_anterior: pend?.status ?? null,
      valor_novo: 'Em Andamento'
    });
    render();
  });

  // Enviar para Testes: requer técnico selecionado; muda status para "Em Teste" e define técnico
  document.getElementById('btnTestes').addEventListener('click', async () => {
    const selVal = document.getElementById('triagemSel').value;
    if (!selVal) { alert('Defina o Técnico de Triagem antes de enviar para testes.'); return; }
    const tester = selVal;
    const ok = await confirmDialog(`Você está prestes a enviar a pendência ${id} para testes por ${tester}.`);
    if (!ok) return;
    const { error: e1 } = await supabase.from('pendencias').update({ status: 'Em Teste', tecnico: tester }).eq('id', id);
    if (e1) { alert('Erro status: ' + e1.message); return; }
    await supabase.from('pendencia_historicos').insert({
      pendencia_id: id,
      acao: 'Pendência enviada para testes',
      usuario: session.get()?.nome || tester,
      campo_alterado: 'tecnico',
      valor_anterior: pend?.tecnico ?? null,
      valor_novo: tester
    });
    render();
  });

  document.getElementById('btnRejeitar').addEventListener('click', async () => {
    const selVal = document.getElementById('triagemSel').value;
    if (!selVal) { alert('Defina o Técnico de Triagem antes de rejeitar.'); return; }
    const ok = await confirmDialog(`Você está prestes a rejeitar a pendência ${id}.`);
    if (!ok) return;
    const motivo = prompt('Motivo da rejeição:');
    if (!motivo) return;
    const { error: e1 } = await saveTriagemNoConflict(supabase, id, { tecnico_triagem: tri?.tecnico_triagem || selVal, data_rejeicao: new Date().toISOString(), motivo_rejeicao: motivo });
    if (e1) { alert('Erro rejeição: ' + e1.message); return; }
    const { error: e2 } = await supabase.from('pendencias').update({ status: 'Rejeitada' }).eq('id', id);
    if (e2) { alert('Erro status: ' + e2.message); return; }
    await supabase.from('pendencia_historicos').insert({
      pendencia_id: id, acao: 'Pendência rejeitada', usuario: selVal,
      campo_alterado: 'motivo_rejeicao', valor_anterior: null, valor_novo: motivo
    });
    render();
  });

  // Aguardar Cliente: requer técnico selecionado; muda status para "Aguardando o Cliente" e define responsável
  document.getElementById('btnAguardarCliente').addEventListener('click', async () => {
    const selVal = document.getElementById('triagemSel').value;
    if (!selVal) { alert('Defina o Técnico de Triagem antes de marcar como Aguardando o Cliente.'); return; }
    const ok = await confirmDialog(`Você está prestes a marcar a pendência ${id} como 'Aguardando o Cliente' por ${selVal}.`);
    if (!ok) return;
    // Atualiza técnico responsável na triagem
    const { error: e1 } = await saveTriagemNoConflict(supabase, id, { tecnico_responsavel: selVal, data_aceite: tri?.data_aceite || new Date().toISOString() });
    if (e1) { alert('Erro responsável: ' + e1.message); return; }
    // Atualiza status e técnico atual na pendência
    const { error: e2 } = await supabase.from('pendencias').update({
      status: 'Aguardando o Cliente', tecnico: selVal
    }).eq('id', id);
    if (e2) { alert('Erro status: ' + e2.message); return; }
    // Histórico da mudança de responsável
    await supabase.from('pendencia_historicos').insert({
      pendencia_id: id,
      acao: 'Pendência marcada para aguardar cliente',
      usuario: session.get()?.nome || selVal,
      campo_alterado: 'tecnico_responsavel',
      valor_anterior: tri?.tecnico_responsavel ?? null,
      valor_novo: selVal
    });
    // Histórico do status alterado
    await supabase.from('pendencia_historicos').insert({
      pendencia_id: id,
      acao: 'Status alterado para Aguardando o Cliente',
      usuario: session.get()?.nome || selVal,
      campo_alterado: 'status',
      valor_anterior: pend?.status ?? null,
      valor_novo: 'Aguardando o Cliente'
    });
    render();
  });

  // Botão Ordem de Serviço movido para o Grid

  // Eventos de filtro e paginação do histórico
  const onFilterInput = debounce((ev) => {
    histFilterText = ev.target.value;
    histCurrentPage = 1;
    renderHistTable();
  }, 200);
  const filterEl = document.getElementById('histFilter');
  if (filterEl) filterEl.addEventListener('input', onFilterInput);
  const clearBtn = document.getElementById('histClear');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    const el = document.getElementById('histFilter');
    if (el) el.value = '';
    histFilterText = '';
    histCurrentPage = 1;
    renderHistTable();
  });
  const pageSel = document.getElementById('histPageSize');
  if (pageSel) pageSel.addEventListener('change', (e) => {
    histPageSize = parseInt(e.target.value, 10) || 10;
    histCurrentPage = 1;
    renderHistTable();
  });
  const prevBtn = document.getElementById('histPrev');
  if (prevBtn) prevBtn.addEventListener('click', () => {
    if (histCurrentPage > 1) {
      histCurrentPage--;
      renderHistTable();
    }
  });

  // Trello: ver texto do card abaixo de Solução/Orientação
  const btnVerCard = document.getElementById('btnVerCard');
  if (btnVerCard) btnVerCard.addEventListener('click', async () => {
    const slot = document.getElementById('trelloPreviewSlot');
    if (!slot) return;
    if (!pend?.link_trello) { alert('Nenhum link Trello foi salvo para esta pendência.'); return; }
    // Toggle: se já estiver aberto, fecha e restaura texto do botão
    const isOpen = slot.dataset.open === 'true';
    if (isOpen) {
      slot.innerHTML = '';
      slot.dataset.open = 'false';
      btnVerCard.textContent = 'Ver Card Trello';
      return;
    }
    if (!TRELLO_KEY || !TRELLO_TOKEN) { alert('Configure TRELLO_KEY e TRELLO_TOKEN em config.js para ler o card no Trello.'); return; }
    const tryExtractCardId = (url) => {
      try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        const idx = parts.indexOf('c');
        if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
        // fallback: último segmento
        return parts[parts.length - 1];
      } catch { return null; }
    };
    const cardId = tryExtractCardId(pend.link_trello);
    if (!cardId) { alert('Não foi possível identificar o ID do card a partir do link do Trello.'); return; }
    const safeFetch = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
    slot.innerHTML = `<div class="card"><div class="hint">Carregando conteúdo do Trello...</div></div>`;
    try {
      const card = await safeFetch(`https://api.trello.com/1/cards/${encodeURIComponent(cardId)}?fields=name,desc,url,shortUrl,idList,idBoard,labels&key=${encodeURIComponent(TRELLO_KEY)}&token=${encodeURIComponent(TRELLO_TOKEN)}`);
      const [listInfo, boardInfo] = await Promise.all([
        card?.idList ? safeFetch(`https://api.trello.com/1/lists/${encodeURIComponent(card.idList)}?fields=name&key=${encodeURIComponent(TRELLO_KEY)}&token=${encodeURIComponent(TRELLO_TOKEN)}`) : Promise.resolve(null),
        card?.idBoard ? safeFetch(`https://api.trello.com/1/boards/${encodeURIComponent(card.idBoard)}?fields=name&key=${encodeURIComponent(TRELLO_KEY)}&token=${encodeURIComponent(TRELLO_TOKEN)}`) : Promise.resolve(null),
      ]);
      const name = card?.name || '(sem título)';
      const desc = card?.desc || '(sem descrição)';
      const lbls = (card?.labels || []).map(l => l.name).filter(Boolean);
      const chipsHtml = [
        boardInfo?.name ? `<span class="trello-chip">Board: ${sanitizeText(boardInfo.name)}</span>` : '',
        listInfo?.name ? `<span class="trello-chip">Lista: ${sanitizeText(listInfo.name)}</span>` : '',
      ].join(' ');
      const labelsHtml = lbls.length ? `<span class="hint">Tags: ${sanitizeText(lbls.join(', '))}</span>` : '';
      slot.innerHTML = `
        <div class="card" style="border-left:4px solid #00B8D9; background: rgba(0,184,217,0.08);">
          <h3>📌 Card Trello — ${sanitizeText(name)}</h3>
          <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; font-size:12px; margin-bottom:6px;">${chipsHtml} ${labelsHtml}</div>
          <div style="white-space:pre-wrap;">${sanitizeText(desc)}</div>
          <div class="toolbar" style="justify-content:flex-end; gap:8px;">
            <a class="btn" href="${card.shortUrl || card.url || pend.link_trello}" target="_blank" rel="noopener">Abrir no Trello</a>
          </div>
        </div>
      `;
    } catch (err) {
      slot.innerHTML = `<div class="card"><div class="error">Falha ao carregar card no Trello: ${sanitizeText(err.message)}</div></div>`;
    }
    slot.dataset.open = 'true';
    btnVerCard.textContent = 'Ocultar Card Trello';
    slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const nextBtn = document.getElementById('histNext');
  if (nextBtn) nextBtn.addEventListener('click', () => {
    const total = applyHistFilter(histAsc, histFilterText).length;
    const maxPage = Math.max(1, Math.ceil(total / histPageSize));
    if (histCurrentPage < maxPage) {
      histCurrentPage++;
      renderHistTable();
    }
  });
  // Render inicial do histórico
  renderHistTable();

  // Cálculo de durações por status (preciso) usando eventos de "Status alterado"
  const relatoTs = pend?.data_relato || histAsc[0]?.created_at || null;
  const resolvidaTs = histAsc.find(h => String(h.acao || '').toLowerCase().includes('resolvid'))?.created_at || null;
  const nowTs = new Date().toISOString();
  const toMs = (a, b) => (a && b) ? Math.max(0, new Date(b) - new Date(a)) : 0;
  const statusEvents = histAsc.filter(h => (
    String(h.campo_alterado || '').toLowerCase() === 'status' ||
    String(h.acao || '').toLowerCase().includes('status alterado')
  ));
  const statusKeys = ['Triagem','Aguardando Aceite','Em Analise','Em Andamento','Aguardando o Cliente','Em Teste','Rejeitada'];
  const durations = Object.fromEntries(statusKeys.map(k => [k, 0]));
  let currentStatus = statusEvents[0]?.valor_anterior || statusEvents[0]?.valor_novo || pend?.status || 'Triagem';
  let prevTs = relatoTs || statusEvents[0]?.created_at || histAsc[0]?.created_at || nowTs;
  for (const e of statusEvents) {
    const ts = e.created_at;
    if (currentStatus && durations[currentStatus] !== undefined) {
      durations[currentStatus] += toMs(prevTs, ts);
    }
    currentStatus = e.valor_novo || currentStatus;
    prevTs = ts;
  }
  // finaliza segmento atual até a resolução (ou agora). Se rejeitada, termina no evento.
  const endTs = resolvidaTs || nowTs;
  if (currentStatus && durations[currentStatus] !== undefined) {
    durations[currentStatus] += toMs(prevTs, endTs);
  }
  const humanize = (ms) => {
    const sec = Math.round(ms / 1000);
    const min = Math.round(sec / 60);
    const hr = Math.round(min / 60);
    const day = Math.round(hr / 24);
    if (day >= 1) return `${day} dia${day > 1 ? 's' : ''}`;
    if (hr >= 1) return `${hr} h`;
    if (min >= 1) return `${min} min`;
    return `${sec} s`;
  };
  const totalMs = Object.values(durations).reduce((a, b) => a + b, 0) || 1;
  const segColors = {
    'Triagem': getStatusColor('Triagem'),
    'Aguardando Aceite': getStatusColor('Aguardando Aceite'),
    'Em Analise': getStatusColor('Em Analise'),
    'Em Andamento': getStatusColor('Em Andamento'),
    'Aguardando o Cliente': getStatusColor('Aguardando o Cliente'),
    'Em Teste': getStatusColor('Em Teste'),
    'Rejeitada': getStatusColor('Rejeitada'),
  };
  const barEl = document.getElementById('timelineBar');
  if (barEl) {
    barEl.innerHTML = ['Triagem','Aguardando Aceite','Em Analise','Em Andamento','Aguardando o Cliente','Em Teste','Rejeitada']
      .map(k => {
        const ms = durations[k];
        const pct = Math.max(0.5, Math.round((ms / totalMs) * 100));
        return `<div title="${k}: ${humanize(ms)}" style="width:${pct}%; background:${segColors[k]}; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px;">${humanize(ms)}</div>`;
      }).join('');
  }
  const legendEl = document.getElementById('timelineLegend');
  if (legendEl) {
    legendEl.innerHTML = ['Triagem','Aguardando Aceite','Em Analise','Em Andamento','Aguardando o Cliente','Em Teste','Rejeitada']
      .map(k => `<div style="display:flex; align-items:center; gap:6px"><span style="display:inline-block; width:12px; height:12px; background:${segColors[k]}; border-radius:2px"></span><span>${k}: ${humanize(durations[k])}</span></div>`)
      .join('');
  }
  const normalizePhone = (raw) => {
    const d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('55')) return d;
    if (d.length >= 10 && d.length <= 11) return '55' + d;
    return d;
  };
  v.addEventListener('click', async (e) => {
    const target = e.target.closest('#btnNotifyTech');
    if (!target) return;
    if (!WHATSAPP_API_TOKEN) { alert('Configure WHATSAPP_API_TOKEN em config.local.js'); return; }
    const clienteNome = (clientes || []).find(c => c.id_cliente === pend?.cliente_id)?.nome || pend?.cliente_id || '—';
    const moduloNome = (modulos || []).find(m => m.id === pend?.modulo_id)?.nome || pend?.modulo_id || '—';
    const tipo = pend?.tipo || '—';
    const prio = pend?.prioridade || '—';
    const tecnico = pend?.tecnico || tri?.tecnico_relato || '—';
    const usuarioTec = (usuarios || []).find(u => String(u.nome || '').toLowerCase() === String(tecnico).toLowerCase());
    const phoneRaw = usuarioTec?.fone_celular || '';
    const phone = normalizePhone(phoneRaw);
    if (!phone) { alert('Telefone do técnico não encontrado.'); return; }
    const pid = (() => { const s = String(id ?? ''); const raw = s.replace(/^ID-/, ''); return 'ID-' + String(raw).padStart(5, '0'); })();
    const dataAbertura = formatDateBr(pend?.data_relato);
    const prevLabel = (pend?.status || '') === 'Resolvido' ? 'Data Conclusão' : 'Previsão de Conclusão';
    const prevValue = pend?.previsao_conclusao ? formatDateBr(pend?.previsao_conclusao) : 'a definir';
    const titulo = String(pend?.descricao || '').trim();
    const prLower = String(prio || '').toLowerCase();
    const alertEmoji = prLower === 'critica' ? '🚨 ' : (prLower === 'alta' ? '⚠️ ' : '');
    const statusLower = String(pend?.status || '').toLowerCase();
    const tecIcon = statusLower === 'aguardando aceite' ? '🔔 ' : '';
    const header = `*${alertEmoji}Pendencia — ${pid}${titulo ? ` • ${titulo}` : ''}*`;
    const info = [
      `*Cliente:* ${clienteNome}`,
      `*Módulo:* ${moduloNome}`,
      `*Tipo:* ${tipo}`,
      `*Técnico:* ${tecIcon}${tecnico}`,
      `*Prioridade:* ${alertEmoji}${prio}`,
      `*Data Abertura:* ${dataAbertura}`,
      `*${prevLabel}:* ${prevValue}`,
      `*Status: ${pend?.status || '—'}*`
    ].join('\n');
    let extraFmt = '';
    if (tipo === 'Programação' || tipo === 'Suporte') {
      extraFmt = [
        `*Situação:* ${pend?.situacao ?? '—'}`,
        `*Etapas:* ${pend?.etapas_reproducao ?? '—'}`,
        `*Frequência:* ${pend?.frequencia ?? '—'}`,
        `*Informações:* ${pend?.informacoes_adicionais ?? '—'}`
      ].join('\n');
    } else if (tipo === 'Implantação') {
      extraFmt = [
        `*Escopo:* ${pend?.escopo ?? '—'}`,
        `*Objetivo:* ${pend?.objetivo ?? '—'}`,
        `*Recursos:* ${pend?.recursos_necessarios ?? '—'}`,
        `*Informações:* ${pend?.informacoes_adicionais ?? '—'}`
      ].join('\n');
    } else if (tipo === 'Atualizacao') {
      extraFmt = [
        `*Escopo:* ${pend?.escopo ?? '—'}`,
        `*Motivação:* ${pend?.objetivo ?? '—'}`,
        `*Impacto:* ${pend?.informacoes_adicionais ?? '—'}`,
        `*Requisitos específicos:* ${pend?.recursos_necessarios ?? '—'}`
      ].join('\\n');
    } else if (tipo === 'Outro') {
      extraFmt = `*Situação:* ${pend?.situacao ?? '—'}`;
    }
    const message = [header, '', info, '', extraFmt].filter(Boolean).join('\n');
    const ok = await confirmDialog(`Enviar notificação para ${phone}?`);
    if (!ok) return;
    try {
      const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      const url = isLocal ? '/proxy/whatsapp/send-text' : '/api/whatsapp/send-text';
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isLocal ? { token: WHATSAPP_API_TOKEN, phone, message } : { phone, message })
      });
      if (!resp.ok) { const txt = await resp.text(); alert('Falha ao enviar: ' + txt); return; }
      alert('Mensagem enviada para o técnico.');
    } catch (e) { alert('Erro ao enviar: ' + (e?.message || e)); }
  });
}