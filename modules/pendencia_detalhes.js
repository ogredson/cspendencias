import { viewMount } from './ui.js';
import { getSupabase } from '../supabaseClient.js';
import { session } from '../utils/session.js';
import { debounce } from '../utils/debounce.js';

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
  const [{ data: pend }, { data: tri }, { data: hist }, { data: usuarios }, { data: clientes }] = await Promise.all([
    supabase.from('pendencias').select('*').eq('id', id).maybeSingle(),
    supabase.from('pendencia_triagem').select('*').eq('pendencia_id', id).maybeSingle(),
    supabase.from('pendencia_historicos').select('*').eq('pendencia_id', id).order('created_at', { ascending: false }),
    supabase.from('usuarios').select('nome').eq('ativo', true).order('nome'),
    supabase.from('clientes').select('id_cliente, nome')
  ]);

  const triagemSel = (usuarios || []).map(u => `<option value="${u.nome}">${u.nome}</option>`).join('');

  // helpers para histórico e formatação
  const fmt = (dt) => dt ? new Date(dt).toLocaleString() : '';
  const findByAction = (arr, needle) => (arr || []).find(h => String(h.acao || '').toLowerCase().includes(needle));
  const histDesignado = findByAction(hist, 'designado para triagem');
  const histAceito = findByAction(hist, 'aceita para resolução');
  const histRejeitada = findByAction(hist, 'rejeitad');
  const histResolvida = findByAction(hist, 'resolvid');

  // Mapeia cores por status para a barra superior
  const getStatusColor = (s) => {
    const map = {
      'Triagem': '#607D8B',
      'Aguardando Aceite': '#FF9800',
      'Em Analise': '#1976D2',
      'Em Andamento': '#43A047',
      'Aguardando Teste': '#8E24AA',
      'Resolvido': '#2E7D32',
      'Rejeitada': '#E53935',
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
      const quem = tri?.tecnico_responsavel ?? histAceito?.usuario ?? '—';
      const quando = fmt(tri?.data_aceite) || fmt(histAceito?.created_at);
      return `Em análise por: ${quem}${quando ? ` • desde: ${quando}` : ''}`;
    }
    if (s === 'Em Andamento') {
      const quem = tri?.tecnico_responsavel ?? histAceito?.usuario ?? '—';
      const quando = fmt(tri?.data_aceite) || fmt(histAceito?.created_at);
      return `Aceita para resolução por: ${quem}${quando ? ` • em: ${quando}` : ''}`;
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
        <td>${new Date(h.created_at).toLocaleString()}</td>
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
        <h3>📋 Programação & Suporte</h3>
        <div><b>Situação:</b><br/>${pend?.situacao ?? 'Não informado'}</div>
        <div><b>Etapas:</b><br/>${pend?.etapas_reproducao ?? 'Não informado'}</div>
        <div><b>Frequência:</b> ${pend?.frequencia ?? 'Não informado'}</div>
        <div><b>Informações:</b><br/>${pend?.informacoes_adicionais ?? 'Não informado'}</div>
      </div>`;
  } else if (pend?.tipo === 'Implantação') {
    detalhesHtml = `
      <div class="card">
        <h3>🚀 Implantação</h3>
        <div><b>Escopo:</b><br/>${pend?.escopo ?? 'Não informado'}</div>
        <div><b>Objetivo:</b><br/>${pend?.objetivo ?? 'Não informado'}</div>
        <div><b>Recursos:</b><br/>${pend?.recursos_necessarios ?? 'Não informado'}</div>
        <div><b>Informações:</b><br/>${pend?.informacoes_adicionais ?? 'Não informado'}</div>
      </div>`;
  } else if (pend?.tipo === 'Atualizacao') {
    detalhesHtml = `
      <div class="card">
        <h3>🔄 Atualização</h3>
        <div><b>Escopo:</b><br/>${pend?.escopo ?? 'Não informado'}</div>
        <div><b>Motivação:</b><br/>${pend?.objetivo ?? 'Não informado'}</div>
        <div><b>Impacto:</b><br/>${pend?.informacoes_adicionais ?? 'Não informado'}</div>
        <div><b>Requisitos específicos:</b><br/>${pend?.recursos_necessarios ?? 'Não informado'}</div>
      </div>`;
  }

  v.innerHTML = `
    <div class="grid">
      <div class="col-6">
        <div class="card">
          <h3>Pendência ${pend?.id ? 'ID-' + String(pend.id).padStart(5, '0') : ''}</h3>
          <div style="background:${getStatusColor(pend?.status)}; color:#fff; padding:6px 10px; border-radius:4px; font-size:12px; margin-bottom:8px;">
            <div style="font-weight:600">${pend?.status || ''}</div>
            <div>${statusDetail}</div>
          </div>
          <div><b>Cliente:</b> ${(clientes || []).find(c => c.id_cliente === pend?.cliente_id)?.nome ?? pend?.cliente_id ?? ''}</div>
          <div><b>Tipo:</b> ${pend?.tipo}</div>
          <div><b>Técnico:</b> ${pend?.tecnico}</div>
          <div><b>Prioridade:</b> ${pend?.prioridade}</div>
          <div><b>Data do relato:</b> ${pend?.data_relato ?? ''}</div>
          <div><b>Título:</b> ${pend?.descricao ?? ''}</div>
          ${pend?.link_trello ? `<div style="margin-top:8px"><a class="btn" href="${pend.link_trello}" target="_blank" rel="noopener">Abrir no Trello</a></div>` : ''}
        </div>
        <div class="card">
          <h3>Controle de Fluxo</h3>
          <div><b>Técnico do Relato:</b> ${tri?.tecnico_relato ?? pend?.tecnico ?? ''}</div>
          <div class="field">
            <label>Técnico de Triagem</label>
            <div style="display:flex; gap:8px; align-items:center;">
              <select id="triagemSel" class="input" style="flex:1"><option value="">Selecione...</option>${triagemSel}</select>
              <button class="btn" id="btnDesignar">Designar para triagem</button>
            </div>
          </div>
          <div class="toolbar" style="margin-top:8px">
            <button class="btn primary" id="btnAnalise">Aceitar Análise</button>
            <button class="btn success" id="btnAceitar">Aceitar Resolução</button>
            <button class="btn danger" id="btnRejeitar">Rejeitar</button>
          </div>
        </div>
        <div class="card">
          <h3>Histórico</h3>
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
        <div class="card" style="min-height:320px">
          <h3>Gráfico Timeline por Status</h3>
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
    const { error: e1 } = await supabase.from('pendencia_triagem').update({
      tecnico_triagem: nome, data_triagem: new Date().toISOString()
    }).eq('pendencia_id', id);
    if (e1) { alert('Erro designar: ' + e1.message); return; }
    const { error: e2 } = await supabase.from('pendencias').update({ status: 'Aguardando Aceite' }).eq('id', id);
    if (e2) { alert('Erro status: ' + e2.message); return; }
    await supabase.from('pendencia_historicos').insert({
      pendencia_id: id, acao: 'Designado para triagem', usuario: session.get()?.nome || nome,
      campo_alterado: 'tecnico_triagem', valor_anterior: tri?.tecnico_triagem ?? null, valor_novo: nome
    });
    render();
  });

  document.getElementById('btnAnalise').addEventListener('click', async () => {
    const selVal = document.getElementById('triagemSel').value;
    if (!selVal) { alert('Defina o Técnico de Triagem antes de aceitar análise.'); return; }
    const resp = selVal;
    const { error: e1 } = await supabase.from('pendencia_triagem').update({
      tecnico_triagem: tri?.tecnico_triagem || resp,
      tecnico_responsavel: resp,
      data_aceite: new Date().toISOString()
    }).eq('pendencia_id', id);
    if (e1) { alert('Erro análise: ' + e1.message); return; }
    const { error: e2 } = await supabase.from('pendencias').update({
      status: 'Em Analise', tecnico: resp
    }).eq('id', id);
    if (e2) { alert('Erro status: ' + e2.message); return; }
    await supabase.from('pendencia_historicos').insert({
      pendencia_id: id, acao: 'Pendência aceita para análise', usuario: session.get()?.nome || resp,
      campo_alterado: 'tecnico_responsavel', valor_anterior: tri?.tecnico_responsavel ?? null, valor_novo: resp
    });
    render();
  });

  document.getElementById('btnAceitar').addEventListener('click', async () => {
    const selVal = document.getElementById('triagemSel').value;
    if (!selVal) { alert('Defina o Técnico de Triagem antes de aceitar resolução.'); return; }
    const resp = selVal;
    const { error: e1 } = await supabase.from('pendencia_triagem').update({
      tecnico_responsavel: resp, data_aceite: new Date().toISOString()
    }).eq('pendencia_id', id);
    if (e1) { alert('Erro aceite: ' + e1.message); return; }
    const { error: e2 } = await supabase.from('pendencias').update({
      status: 'Em Andamento', tecnico: resp
    }).eq('id', id);
    if (e2) { alert('Erro status: ' + e2.message); return; }
    await supabase.from('pendencia_historicos').insert({
      pendencia_id: id, acao: 'Pendência aceita para resolução', usuario: session.get()?.nome || resp,
      campo_alterado: 'tecnico_responsavel', valor_anterior: tri?.tecnico_responsavel ?? null, valor_novo: resp
    });
    render();
  });

  document.getElementById('btnRejeitar').addEventListener('click', async () => {
    const selVal = document.getElementById('triagemSel').value;
    if (!selVal) { alert('Defina o Técnico de Triagem antes de rejeitar.'); return; }
    const motivo = prompt('Motivo da rejeição:');
    if (!motivo) return;
    const { error: e1 } = await supabase.from('pendencia_triagem').update({
      tecnico_triagem: tri?.tecnico_triagem || selVal,
      data_rejeicao: new Date().toISOString(),
      motivo_rejeicao: motivo
    }).eq('pendencia_id', id);
    if (e1) { alert('Erro rejeição: ' + e1.message); return; }
    const { error: e2 } = await supabase.from('pendencias').update({ status: 'Rejeitada' }).eq('id', id);
    if (e2) { alert('Erro status: ' + e2.message); return; }
    await supabase.from('pendencia_historicos').insert({
      pendencia_id: id, acao: 'Pendência rejeitada', usuario: selVal,
      campo_alterado: 'motivo_rejeicao', valor_anterior: null, valor_novo: motivo
    });
    render();
  });

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

  // Cálculo de durações por status e render do gráfico
  const findActionTs = (needle) => histAsc.find(h => String(h.acao || '').toLowerCase().includes(needle))?.created_at || null;
  const relatoTs = pend?.data_relato || histAsc[0]?.created_at || null;
  const designadoTs = tri?.data_triagem || findActionTs('designado para triagem');
  const aceiteAnaliseTs = tri?.data_aceite || findActionTs('aceita para análise');
  const aceitaResolucaoTs = findActionTs('aceita para resolução');
  const rejeicaoTs = tri?.data_rejeicao || findActionTs('rejeitad');
  const resolvidaTs = findActionTs('resolvid');
  const nowTs = new Date().toISOString();
  const toMs = (a, b) => (a && b) ? Math.max(0, new Date(b) - new Date(a)) : 0;
  const durations = {
    'Triagem': toMs(relatoTs, designadoTs),
    'Aguardando Aceite': toMs(designadoTs, aceiteAnaliseTs),
    'Em Analise': toMs(aceiteAnaliseTs, aceitaResolucaoTs),
    'Em Andamento': rejeicaoTs ? 0 : toMs(aceitaResolucaoTs || aceiteAnaliseTs, resolvidaTs || nowTs),
    'Rejeitada': rejeicaoTs ? toMs(designadoTs || aceiteAnaliseTs || relatoTs, rejeicaoTs) : 0,
  };
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
    'Rejeitada': getStatusColor('Rejeitada'),
  };
  const barEl = document.getElementById('timelineBar');
  if (barEl) {
    barEl.innerHTML = ['Triagem','Aguardando Aceite','Em Analise','Em Andamento','Rejeitada']
      .map(k => {
        const ms = durations[k];
        const pct = Math.max(0.5, Math.round((ms / totalMs) * 100));
        return `<div title="${k}: ${humanize(ms)}" style="width:${pct}%; background:${segColors[k]}; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px;">${humanize(ms)}</div>`;
      }).join('');
  }
  const legendEl = document.getElementById('timelineLegend');
  if (legendEl) {
    legendEl.innerHTML = ['Triagem','Aguardando Aceite','Em Analise','Em Andamento','Rejeitada']
      .map(k => `<div style="display:flex; align-items:center; gap:6px"><span style="display:inline-block; width:12px; height:12px; background:${segColors[k]}; border-radius:2px"></span><span>${k}: ${humanize(durations[k])}</span></div>`)
      .join('');
  }
}