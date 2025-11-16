// topo do arquivo (escopo global)
import { viewMount, confirmDialog, openModal } from './ui.js';
import { getSupabase } from '../supabaseClient.js';
import { debounce } from '../utils/debounce.js';
import { sanitizeText, toDate, formatDateBr } from '../utils/validation.js';
import { storage } from '../utils/storage.js';
import { session } from '../utils/session.js';

let clienteMap = {};
let moduloMap = {};

function daysSince(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((startOfToday - startOfDate) / (24 * 60 * 60 * 1000));
  return diff > 0 ? String(diff) : '—';
}

function rowHtml(p) {
  const triRelato = Array.isArray(p.pendencia_triagem) ? (p.pendencia_triagem[0]?.tecnico_relato ?? '') : (p.pendencia_triagem?.tecnico_relato ?? '');
  const clienteNome = clienteMap[p.cliente_id] ?? p.cliente_id ?? '';
  const titulo = String(p.descricao ?? '');
  const tituloAttr = titulo.replace(/"/g, '&quot;');
  return `
    <tr data-id="${p.id}">
      <td><input type="checkbox" class="sel" /></td>
      <td><a href="#/pendencia?id=${p.id}" class="link">${p.id}</a></td>
      <td title="${tituloAttr}">${clienteNome}</td>
      <td>${moduloMap[p.modulo_id] ?? p.modulo_id ?? ''}</td>
      <td>${p.tipo}</td>
      <td class="col-tech-relato">${triRelato ?? ''}</td>
      <td class="col-tech-resp">${p.tecnico}</td>
      <td><span class="prio ${p.prioridade}" aria-label="${p.prioridade}">${p.prioridade}</span></td>
      <td><span class="status ${p.status}" aria-label="${p.status}">${p.status}</span></td>
      <td>${daysSince(p.data_relato)}</td>
      <td>${formatDateBr(p.data_relato)}</td>
      <td>
        <button class="btn success" data-act="res">Resolvido</button>
        <button class="btn" data-act="edit">Editar</button>
        <button class="btn danger" data-act="del">Excluir</button>
      </td>
    </tr>
  `;
}

async function listClientes() {
  const cached = storage.get('clientes');
  if (cached) return cached;
  const supabase = getSupabase();
  const { data } = await supabase.from('clientes').select('id_cliente, nome');
  storage.set('clientes', data ?? [], 60 * 60 * 1000);
  return data ?? [];
}

async function listModulos() {
  const cached = storage.get('modulos');
  if (cached) return cached;
  const supabase = getSupabase();
  const { data } = await supabase.from('modulos').select('id, nome').order('id');
  storage.set('modulos', data ?? [], 60 * 60 * 1000);
  return data ?? [];
}

async function fetchPendencias(filters = {}, page = 1, limit = 20) {
  const supabase = getSupabase();
  let q = supabase
    .from('pendencias')
    .select('*, pendencia_triagem(tecnico_relato, tecnico_responsavel)')
    .order('created_at', { ascending: false });
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.tipo) q = q.eq('tipo', filters.tipo);
  if (filters.modulo_id) q = q.eq('modulo_id', Number(filters.modulo_id));
  if (filters.cliente_id) q = q.eq('cliente_id', filters.cliente_id);
  if (filters.tecnico) q = q.ilike('tecnico', `%${filters.tecnico}%`);
  if (filters.data_ini) q = q.gte('data_relato', filters.data_ini);
  if (filters.data_fim) q = q.lte('data_relato', filters.data_fim);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await q
    .range(from, to)
    .select('*, pendencia_triagem(tecnico_relato, tecnico_responsavel)', { count: 'exact' });
  return { data: data ?? [], error, count: count ?? 0 };
}

function formHtml(clientes) {
  const clienteOptions = clientes.map(c => `<option value="${c.id_cliente}">${c.nome}</option>`).join('');
  const user = session.get();
  return `
  <div class="card">
    <h3>Nova Pendência</h3>
    <form id="pForm" class="form">
      <div class="tabs" role="tablist" style="display:flex; gap:8px; margin-bottom:8px;">
        <button type="button" class="tab active" data-tab="dados">Dados</button>
        <button type="button" class="tab" data-tab="solucao">Solução/Orientação</button>
      </div>
      <div id="tabContentDados" data-tab-content="dados">
      <div class="row">
        <div class="col-6 field">
          <label>Cliente</label>
          <select name="cliente_id" class="input">
            <option value="">Selecione...</option>
            ${clienteOptions}
          </select>
        </div>
        <div class="col-6 field">
          <label>Módulo</label>
          <select class="input" name="modulo_id" required id="moduloSel"></select>
        </div>
      </div>
      <div class="row">
        <div class="col-4 field">
          <label>Tipo</label>
          <select class="input" name="tipo" required>
            <option>Programação</option>
            <option selected>Suporte</option>
            <option>Implantação</option>
            <option>Atualizacao</option>
          </select>
        </div>
        <div class="col-4 field">
          <label>Prioridade</label>
          <select class="input" name="prioridade" required>
            <option>Critica</option>
            <option>Alta</option>
            <option selected>Media</option>
            <option>Baixa</option>
          </select>
        </div>
        <div class="col-4 field">
          <label>Status</label>
          <select class="input" name="status" required disabled>
            <option selected>Triagem</option>
          </select>
        </div>
      </div>
      <div class="row">
        <div class="col-6 field">
          <label>Técnico do Relato</label>
          <select class="input" name="tecnico" required id="tecnicoSel"></select>
        </div>
        <div class="col-3 field">
          <label>Data do relato</label>
          <input class="input" type="date" name="data_relato" required />
        </div>
        <div class="col-3 field">
          <label>Previsão conclusão</label>
          <input class="input" type="date" name="previsao_conclusao" />
        </div>
      </div>
      <div class="row">
        <div class="col-12 field">
          <label>Informe a pendência ou situação:</label>
          <input class="input" name="descricao" required />
        </div>
      </div>
      <div class="row">
        <div class="col-12 field">
          <label>Link do Trello (URL do card)</label>
          <input class="input" type="url" name="link_trello" placeholder="https://trello.com/c/..." />
        </div>
      </div>
      <div class="card" id="grpPS" style="margin-top:8px">
        <h4>📋 Programação & Suporte</h4>
        <div class="field">
          <label>Situação: Informe o problema ou bug</label>
          <textarea class="input" name="situacao"></textarea>
        </div>
        <div class="field">
          <label>Etapas: Como reproduzir o problema?</label>
          <textarea class="input" name="etapas_reproducao"></textarea>
        </div>
        <div class="field">
          <label>Frequência: Com que frequência ocorre?</label>
          <input class="input" name="frequencia" />
        </div>
        <div class="field">
          <label>Informações: Detalhes adicionais (Versao do sistema, Plataformas: Windows/Linux, Banco de dados etc.)</label>
          <textarea class="input" name="informacoes_adicionais"></textarea>
        </div>
      </div>
      <div class="card" id="grpImpl" style="margin-top:8px">
        <h4>🚀 Implantação</h4>
        <div class="field">
          <label>Escopo: Qual o escopo da implantação?</label>
          <textarea class="input" name="escopo"></textarea>
        </div>
        <div class="field">
          <label>Objetivo: Qual resultado esperado?</label>
          <textarea class="input" name="objetivo"></textarea>
        </div>
        <div class="field">
          <label>Recursos: Quais recursos são necessários?</label>
          <textarea class="input" name="recursos_necessarios"></textarea>
        </div>
        <div class="field">
          <label>Informações: Observações importantes</label>
          <textarea class="input" name="informacoes_adicionais"></textarea>
        </div>
      </div>
      <div class="card" id="grpAtual" style="margin-top:8px">
        <h4>🔄 Atualização</h4>
        <div class="field">
          <label>Escopo: O que será atualizado?</label>
          <textarea class="input" name="escopo"></textarea>
        </div>
        <div class="field">
          <label>Motivação: Por que esta atualização?</label>
          <textarea class="input" name="objetivo"></textarea>
        </div>
        <div class="field">
          <label>Impacto: Qual o impacto nos usuários?</label>
          <textarea class="input" name="informacoes_adicionais"></textarea>
        </div>
        <div class="field">
          <label>Requisitos específicos</label>
          <textarea class="input" name="recursos_necessarios"></textarea>
        </div>
      </div>
      </div>
      <div id="tabContentSolucao" data-tab-content="solucao" style="display:none;">
        <div class="card" style="margin-top:8px;">
          <h4>💡 Solução / Orientação</h4>
          <div class="field">
            <label>Descreva a solução, possível solução ou orientação</label>
            <textarea class="input" name="solucao_orientacao" placeholder="Opcional"></textarea>
          </div>
          <div class="hint">Opcional — informações que ajudem a solucionar a pendência.</div>
        </div>
      </div>
      <div class="toolbar" style="justify-content:flex-end">
        <button class="btn" type="button" id="closeModalBtn">Fechar</button>
        <button class="btn primary" type="submit">Salvar</button>
      </div>
    </form>
    <div id="pFormMsg" class="hint"></div>
  </div>`;
}

function filtersHtml(clientes, usuarios = [], modulos = []) {
  const clienteOptions = ['<option value="">Todos</option>', ...clientes.map(c => `<option value="${c.id_cliente}">${c.nome}</option>`)].join('');
  const tecnicoOptions = ['<option value="">Técnico</option>', ...usuarios.map(u => `<option value="${u.nome}">${u.nome}</option>`)].join('');
  const moduloOptions = ['<option value="">Módulo</option>', ...modulos.map(m => `<option value="${m.id}">${m.nome}</option>`)].join('');
  return `
  <div class="card">
    <div class="filters">
      <select id="fStatus" class="input">
        <option value="">Status</option>
        <option>Triagem</option>
        <option>Aguardando Aceite</option>
        <option>Em Analise</option>
        <option>Rejeitada</option>
        <option>Em Andamento</option>
        <option>Em Teste</option>
        <option>Resolvido</option>
      </select>
      <select id="fTipo" class="input">
        <option value="">Tipo</option>
        <option>Programação</option>
        <option>Suporte</option>
        <option>Implantação</option>
        <option>Atualizacao</option>
      </select>
      <select id="fModulo" class="input">${moduloOptions}</select>
      <select id="fCliente" class="input">${clienteOptions}</select>
      <select id="fTecnico" class="input">${tecnicoOptions}</select>
      <input id="fDataIni" class="input" type="date" />
      <input id="fDataFim" class="input" type="date" />
    </div>
    <div class="toolbar" style="margin-top:8px">
      <button class="btn success" id="applyFilters">Aplicar filtros</button>
      <button class="btn warning" id="clearFilters">Limpar</button>
      <button class="btn info" id="toggleView">Alternar Visão</button>
      <button class="btn primary" id="novoBtn">Novo</button>
    </div>
  </div>`;
}

function gridHtml() {
  return `
  <div class="card">
    <div class="toolbar" style="justify-content:space-between; margin-bottom:8px">
      <div id="pageInfo" class="hint"></div>
      <div>
        <button class="btn" id="prevPage">Anterior</button>
        <button class="btn" id="nextPage">Próxima</button>
      </div>
    </div>
    <div id="virtWrap" style="height:calc(100vh - 320px); overflow:auto;">
      <table id="pTable" class="table">
        <thead>
          <tr>
            <th><input type="checkbox" id="selAll" /></th>
            <th>ID</th>
            <th>Cliente</th>
            <th>Módulo</th>
            <th>Tipo</th>
            <th>Técnico Relato</th>
            <th>Técnico Resp.</th>
            <th>Prioridade</th>
            <th>Status</th>
            <th>Dias</th>
            <th>Data Relato</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr class="filler" style="height:0px"></tr>
        </tbody>
      </table>
    </div>
  </div>`;
}

// definição global de status usados na visão Kanban
const STATUSES = ['Triagem','Aguardando Aceite','Rejeitada','Em Analise','Em Andamento','Em Teste','Resolvido'];
const slug = (s) => String(s).toLowerCase().replace(/\s+/g, '_');

function kanbanHtml() {
  return `
  <div id="kanbanWrap" style="display:grid; grid-template-columns: repeat(7, 1fr); gap:8px;">
    ${STATUSES.map(s => `
      <div class="card">
        <h4 style="margin:0 0 8px 0">${s}</h4>
        <div id="kb-${slug(s)}" style="display:flex; flex-direction:column; gap:8px;"></div>
      </div>
    `).join('')}
  </div>`;
};

export async function render() {
  const v = viewMount();
  const clientes = await listClientes();
  const modulos = await listModulos();

  // Fallback seguro para lista de usuários (não bloquear render)
  let usuarios = [];
  try {
    const supabaseUsers = getSupabase();
    if (supabaseUsers) {
      const { data } = await supabaseUsers
        .from('usuarios')
        .select('nome')
        .eq('ativo', true)
        .order('nome');
      usuarios = data || [];
    }
  } catch {
    usuarios = [];
  }

  const user = session.get();
  clienteMap = Object.fromEntries((clientes || []).map(c => [c.id_cliente, c.nome]));
  moduloMap = Object.fromEntries((modulos || []).map(m => [m.id, m.nome]));

  v.innerHTML = `
    <div class="grid">
      <div class="col-12"><div class="hint">Usuário logado: ${user?.nome ?? '—'}</div></div>
      <div class="col-12">${filtersHtml(clientes, usuarios, modulos)}</div>
      <div class="col-12"><div id="viewArea">${gridHtml()}</div></div>
    </div>
  `;

  const state = { page: 1, limit: 200, filters: {}, data: [], viewMode: 'grid' };

  // Helper: captura filtros dos inputs
  const captureFilters = () => ({
    status: sanitizeText(document.getElementById('fStatus').value) || undefined,
    tipo: sanitizeText(document.getElementById('fTipo').value) || undefined,
    modulo_id: sanitizeText(document.getElementById('fModulo').value) || undefined,
    cliente_id: sanitizeText(document.getElementById('fCliente').value) || undefined,
    tecnico: sanitizeText(document.getElementById('fTecnico').value) || undefined,
    data_ini: toDate(document.getElementById('fDataIni').value) || undefined,
    data_fim: toDate(document.getElementById('fDataFim').value) || undefined,
  });
  
  // Default: últimos 7 dias
  const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const today = new Date();
  const start7 = new Date(today);
  start7.setDate(today.getDate() - 7);
  const iniStr = toYMD(start7);
  const fimStr = toYMD(today);
  const iniEl = document.getElementById('fDataIni');
  const fimEl = document.getElementById('fDataFim');
  if (iniEl) iniEl.value = iniStr;
  if (fimEl) fimEl.value = fimStr;
  state.filters.data_ini = iniStr;
  state.filters.data_fim = fimStr;

  const renderViewArea = () => {
    const area = document.getElementById('viewArea');
    area.innerHTML = state.viewMode === 'grid' ? gridHtml() : kanbanHtml();
    if (state.viewMode === 'grid') bindGridEvents();
  };

  const apply = async () => {
    const { data, count } = await fetchPendencias(state.filters, state.page, state.limit);
    state.data = data;
    if (state.viewMode === 'grid') {
      const pageInfoEl = document.getElementById('pageInfo');
      if (pageInfoEl) pageInfoEl.textContent = `Página ${state.page} • ${count} registros (virtual ${state.data.length})`;
      renderVirtual();
    } else {
      renderKanban();
    }
  };

  const renderVirtual = () => {
    const wrap = document.getElementById('virtWrap');
    const tbody = document.querySelector('#pTable tbody');
    const spacer = document.getElementById('spacer');
    const rowHeight = 44;
    const total = state.data.length;
    const visible = Math.ceil(wrap.clientHeight / rowHeight) + 6;
    const start = Math.max(0, Math.floor(wrap.scrollTop / rowHeight));
    const end = Math.min(total, start + visible);
    const slice = state.data.slice(start, end);
    const topPad = start * rowHeight;
    const bottomPad = (total - end) * rowHeight;
    tbody.innerHTML = [
      `<tr class="filler" style="height:${topPad}px"></tr>`,
      slice.map(rowHtml).join(''),
      `<tr class="filler" style="height:${bottomPad}px"></tr>`
    ].join('');
  };

  const renderKanban = () => {
    const byStatus = Object.create(null);
    STATUSES.forEach(s => byStatus[s] = []);
    state.data.forEach(p => {
      const s = String(p.status || '').trim();
      (byStatus[s] || (byStatus[s] = [])).push(p);
    });
    const cardHtml = (p) => `
      <div class="card" style="padding:8px;">
        <div style="font-weight:600; margin-bottom:4px;">${clienteMap[p.cliente_id] ?? p.cliente_id ?? ''} • 
        <a href="#/pendencia?id=${p.id}" class="link">${p.id}</a>
        </div>
        <div class="hint" style="margin-bottom:4px;">${p.tecnico ?? ''}</div>
        <div style="font-size:12px;">${sanitizeText(p.descricao) || ''}</div>
      </div>
    `;
    STATUSES.forEach(s => {
      const el = document.getElementById('kb-' + slug(s));
      if (el) el.innerHTML = (byStatus[s] || []).map(cardHtml).join('');
    });
  };

  // Filtros
  const debouncedApply = debounce(apply, 300);
  document.getElementById('applyFilters').addEventListener('click', () => {
    state.filters = captureFilters();
    state.page = 1;
    debouncedApply();
  });
  document.getElementById('clearFilters').addEventListener('click', () => {
    // Reset visual
    ['fStatus','fTipo','fModulo','fCliente','fTecnico'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const t = new Date();
    const s7 = new Date(t); s7.setDate(t.getDate() - 7);
    const ini = toYMD(s7); const fim = toYMD(t);
    if (iniEl) iniEl.value = ini;
    if (fimEl) fimEl.value = fim;
    // Reset lógico mantendo “últimos 7 dias”
    state.filters = { data_ini: ini, data_fim: fim };
    state.page = 1;
    debouncedApply();
  });

  // Alternar Grid/Kanban
  document.getElementById('toggleView').addEventListener('click', () => {
    state.viewMode = state.viewMode === 'grid' ? 'kanban' : 'grid';
    renderViewArea();
    apply();
  });
  
  // “Novo”: abre modal com formulário e salva
  document.getElementById('novoBtn').addEventListener('click', () => {
    const modal = openModal(formHtml(clientes));
    // Popular selects de módulo e técnico
    const modSel = modal.querySelector('#moduloSel');
    const tecSel = modal.querySelector('#tecnicoSel');
    if (modSel) modSel.innerHTML = ['<option value="">Selecione...</option>', ...modulos.map(m => `<option value="${m.id}">${m.nome}</option>`)].join('');
    if (tecSel) tecSel.innerHTML = ['<option value="">Selecione...</option>', ...usuarios.map(u => `<option value="${u.nome}">${u.nome}</option>`)].join('');
    // Default: técnico logado e data de hoje
    const userName = session.get()?.nome || '';
    if (tecSel) {
      // Seleciona o técnico logado, garantindo a opção caso não exista
      const hasUser = Array.from(tecSel.options).some(o => o.value === userName);
      if (!hasUser && userName) tecSel.insertAdjacentHTML('beforeend', `<option value="${userName}">${userName}</option>`);
      tecSel.value = userName || '';
    }
    const dr = modal.querySelector('input[name="data_relato"]');
    const toYMD = (d) => {
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    if (dr) dr.value = toYMD(new Date());
    const tabs = modal.querySelectorAll('.tab');
    tabs.forEach(tab => tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      modal.querySelectorAll('[data-tab-content]').forEach(c => {
        c.style.display = c.getAttribute('data-tab-content') === tab.getAttribute('data-tab') ? '' : 'none';
      });
    }));
  
    // Fechar
    const closeBtn = modal.querySelector('#closeModalBtn');
    if (closeBtn && modal.closeModal) closeBtn.addEventListener('click', () => modal.closeModal());
    // Mostrar/ocultar grupos conforme tipo
    const tipoSel = modal.querySelector('select[name="tipo"]');
    const grpPS = modal.querySelector('#grpPS');
    const grpImpl = modal.querySelector('#grpImpl');
    const grpAtual = modal.querySelector('#grpAtual');
    const updateGroupsByType = () => {
      const tipo = (tipoSel?.value || '').trim();
      const showPS = tipo === 'Programação' || tipo === 'Suporte';
      const showImpl = tipo === 'Implantação';
      const showAtual = tipo === 'Atualizacao';
      if (grpPS) grpPS.style.display = showPS ? '' : 'none';
      if (grpImpl) grpImpl.style.display = showImpl ? '' : 'none';
      if (grpAtual) grpAtual.style.display = showAtual ? '' : 'none';
    };
    updateGroupsByType();
    if (tipoSel) tipoSel.addEventListener('change', updateGroupsByType);
    // Salvar
    const form = modal.querySelector('#pForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = {
        cliente_id: fd.get('cliente_id') || null,
        modulo_id: Number(fd.get('modulo_id')),
        tipo: fd.get('tipo'),
        prioridade: fd.get('prioridade'),
        status: 'Triagem',
        tecnico: fd.get('tecnico'),
        data_relato: fd.get('data_relato'),
        previsao_conclusao: fd.get('previsao_conclusao') || null,
        descricao: fd.get('descricao'),
        link_trello: fd.get('link_trello') || null,
        // Campos existentes no banco
        situacao: fd.get('situacao') || null,
        etapas_reproducao: fd.get('etapas_reproducao') || null,
        frequencia: fd.get('frequencia') || null,
        informacoes_adicionais: fd.get('informacoes_adicionais') || null,
        escopo: fd.get('escopo') || null,
        objetivo: fd.get('objetivo') || null,
        recursos_necessarios: fd.get('recursos_necessarios') || null,
        solucao_orientacao: fd.get('solucao_orientacao') || null,
      };
      const supabase = getSupabase();
      const { error } = await supabase.from('pendencias').insert(payload);
      const msgEl = modal.querySelector('#pFormMsg');
      if (error) {
        if (msgEl) msgEl.textContent = 'Erro ao salvar: ' + error.message;
        return;
      }
      if (msgEl) msgEl.textContent = 'Pendência criada com sucesso.';
      if (modal.closeModal) modal.closeModal();
      state.page = 1;
      await apply();
    });
  });

  // Observadores de filtros (change/input)
  const updateFilters = debounce(() => {
    state.filters = captureFilters();
    state.page = 1;
    debouncedApply();
  }, 250);
  ['fStatus','fTipo','fModulo','fCliente','fTecnico','fDataIni','fDataFim'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', updateFilters);
    el.addEventListener('input', updateFilters);
  });

  // Eventos exclusivos do Grid (com guardas)
  const bindGridEvents = () => {
    const virtWrap = document.getElementById('virtWrap');
    if (virtWrap) virtWrap.addEventListener('scroll', debounce(renderVirtual, 10));
    const selAll = document.getElementById('selAll');
    if (selAll) selAll.addEventListener('change', (e) => {
      document.querySelectorAll('#pTable tbody .sel').forEach(cb => cb.checked = e.target.checked);
    });
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    if (prevBtn) prevBtn.addEventListener('click', () => { state.page = Math.max(1, state.page - 1); apply(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { state.page += 1; apply(); });
    const pTable = document.querySelector('#pTable');
    if (pTable) {
      pTable.addEventListener('click', async (e) => {
        const act = e.target.getAttribute('data-act');
        if (!act) return;
        const tr = e.target.closest('tr');
        const id = tr.getAttribute('data-id');
        const supabase = getSupabase();

        if (act === 'edit') {
          // Abrir modal de edição com dados da pendência
          const { data: pend } = await supabase.from('pendencias').select('*').eq('id', id).maybeSingle();
          const modal = openModal(formHtml(clientes));
          // Título: Editar Pendência
          const h3 = modal.querySelector('h3');
          if (h3) h3.textContent = `Editar Pendência`;
          // Popular selects de módulo e técnico
          const modSel = modal.querySelector('#moduloSel');
          const tecSel = modal.querySelector('#tecnicoSel');
          if (modSel) modSel.innerHTML = ['<option value="">Selecione...</option>', ...modulos.map(m => `<option value="${m.id}">${m.nome}</option>`)].join('');
          if (tecSel) tecSel.innerHTML = ['<option value="">Selecione...</option>', ...usuarios.map(u => `<option value="${u.nome}">${u.nome}</option>`)].join('');
          // Preencher valores
          const setVal = (sel, val) => { if (sel && val != null) sel.value = String(val); };
          setVal(modal.querySelector('select[name="cliente_id"]'), pend?.cliente_id ?? '');
          setVal(modSel, pend?.modulo_id ?? '');
          setVal(modal.querySelector('select[name="tipo"]'), pend?.tipo ?? '');
          setVal(modal.querySelector('select[name="prioridade"]'), pend?.prioridade ?? '');
          setVal(tecSel, pend?.tecnico ?? '');
          const toYMD = (d) => {
            if (!d) return '';
            const dd = new Date(d);
            if (isNaN(dd.getTime())) return '';
            const y = dd.getFullYear(), m = String(dd.getMonth() + 1).padStart(2, '0'), day = String(dd.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          };
          const dr = modal.querySelector('input[name="data_relato"]');
          const pc = modal.querySelector('input[name="previsao_conclusao"]');
          if (dr) dr.value = toYMD(pend?.data_relato);
          if (pc) pc.value = toYMD(pend?.previsao_conclusao);
          setVal(modal.querySelector('input[name="descricao"]'), pend?.descricao ?? '');
          setVal(modal.querySelector('input[name="link_trello"]'), pend?.link_trello ?? '');
          // Campos adicionais
          setVal(modal.querySelector('textarea[name="situacao"]'), pend?.situacao ?? '');
          setVal(modal.querySelector('textarea[name="etapas_reproducao"]'), pend?.etapas_reproducao ?? '');
          setVal(modal.querySelector('input[name="frequencia"]'), pend?.frequencia ?? '');
          setVal(modal.querySelector('textarea[name="informacoes_adicionais"]'), pend?.informacoes_adicionais ?? '');
          setVal(modal.querySelector('textarea[name="escopo"]'), pend?.escopo ?? '');
          setVal(modal.querySelector('textarea[name="objetivo"]'), pend?.objetivo ?? '');
          setVal(modal.querySelector('textarea[name="recursos_necessarios"]'), pend?.recursos_necessarios ?? '');
          setVal(modal.querySelector('textarea[name="solucao_orientacao"]'), pend?.solucao_orientacao ?? '');
          // Status apenas exibição
          const statusSel = modal.querySelector('select[name="status"]');
          if (statusSel) {
            statusSel.innerHTML = `<option selected>${pend?.status || 'Triagem'}</option>`;
            statusSel.disabled = true;
          }
          // Tabs e fechamento
          const tabs = modal.querySelectorAll('.tab');
          tabs.forEach(tab => tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            modal.querySelectorAll('[data-tab-content]').forEach(c => {
              c.style.display = c.getAttribute('data-tab-content') === tab.getAttribute('data-tab') ? '' : 'none';
            });
          }));
          const closeBtn = modal.querySelector('#closeModalBtn');
          if (closeBtn && modal.closeModal) closeBtn.addEventListener('click', () => modal.closeModal());
          // Mostrar/ocultar grupos conforme tipo
          const tipoSel = modal.querySelector('select[name="tipo"]');
          const grpPS = modal.querySelector('#grpPS');
          const grpImpl = modal.querySelector('#grpImpl');
          const grpAtual = modal.querySelector('#grpAtual');
          const updateGroupsByType = () => {
            const tipo = (tipoSel?.value || '').trim();
            const showPS = tipo === 'Programação' || tipo === 'Suporte';
            const showImpl = tipo === 'Implantação';
            const showAtual = tipo === 'Atualizacao';
            if (grpPS) grpPS.style.display = showPS ? '' : 'none';
            if (grpImpl) grpImpl.style.display = showImpl ? '' : 'none';
            if (grpAtual) grpAtual.style.display = showAtual ? '' : 'none';
          };
          updateGroupsByType();
          if (tipoSel) tipoSel.addEventListener('change', updateGroupsByType);
          // Salvar (update)
          const form = modal.querySelector('#pForm');
          const msgEl = modal.querySelector('#pFormMsg');
          form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const fd = new FormData(form);
            const payload = {
              cliente_id: fd.get('cliente_id') || null,
              modulo_id: Number(fd.get('modulo_id')),
              tipo: fd.get('tipo'),
              prioridade: fd.get('prioridade'),
              tecnico: fd.get('tecnico'),
              data_relato: fd.get('data_relato'),
              previsao_conclusao: fd.get('previsao_conclusao') || null,
              descricao: fd.get('descricao'),
              link_trello: fd.get('link_trello') || null,
              // Campos existentes
              situacao: fd.get('situacao') || null,
              etapas_reproducao: fd.get('etapas_reproducao') || null,
              frequencia: fd.get('frequencia') || null,
              informacoes_adicionais: fd.get('informacoes_adicionais') || null,
              escopo: fd.get('escopo') || null,
              objetivo: fd.get('objetivo') || null,
              recursos_necessarios: fd.get('recursos_necessarios') || null,
              solucao_orientacao: fd.get('solucao_orientacao') || null,
            };
            const { error } = await supabase.from('pendencias').update(payload).eq('id', id);
            if (error) {
              if (msgEl) msgEl.textContent = 'Erro ao salvar: ' + error.message;
              return;
            }
            if (msgEl) msgEl.textContent = 'Pendência atualizada com sucesso.';
            if (modal.closeModal) modal.closeModal();
            apply();
          });
          return;
        }
        if (act === 'del') {
          const ok = await confirmDialog(`Você está prestes a excluir a pendência ${id}. Esta ação é permanente.`);
          if (!ok) return;
          await supabase.from('pendencias').delete().eq('id', id);
          apply();
          return;
        }
        if (act === 'res') {
          const { data: prev } = await supabase
              .from('pendencias')
              .select('status, tecnico, descricao')
              .eq('id', id)
              .maybeSingle();
          
          const formatPendId = (val) => {
              const s = String(val ?? '');
              const raw = s.replace(/^ID-/, '');
              return 'ID-' + String(raw).padStart(5, '0');
          };
          const titulo = sanitizeText(prev?.descricao || '');
          
          const modal = openModal(`
              <div class="card">
                <h3>Registrar Solução — ${formatPendId(id)}${titulo ? ` • ${titulo}` : ''}</h3>
                <form id="resolveForm" class="form">
                  <div class="field">
                    <label>Solução / Orientação</label>
                    <textarea class="input" name="solucao_orientacao" placeholder="Descreva a solução aplicada ou orientação"></textarea>
                  </div>
                  <div class="toolbar" style="justify-content:flex-end">
                    <button class="btn" type="button" id="cancelResolve">Cancelar</button>
                    <button class="btn success" type="submit">Salvar e Resolver</button>
                  </div>
                </form>
              </div>
          `);
          
          const cancelBtn = modal.querySelector('#cancelResolve');
          if (cancelBtn && modal.closeModal) cancelBtn.addEventListener('click', () => modal.closeModal());
          
          const form = modal.querySelector('#resolveForm');
          form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            // Confirmação padrão antes de salvar e resolver
            const ok = await confirmDialog(`Confirmar resolução da pendência ${formatPendId(id)}${titulo ? ` • ${titulo}` : ''}?`);
            if (!ok) return;
          
            const fd = new FormData(form);
            const sol = fd.get('solucao_orientacao') || null;
          
            const usuario = session.get()?.nome || prev?.tecnico || '—';
            await supabase.from('pendencias').update({ status: 'Resolvido', solucao_orientacao: sol }).eq('id', id);
            await supabase.from('pendencia_historicos').insert({
              pendencia_id: id, acao: 'Pendência resolvida', usuario,
              campo_alterado: 'status', valor_anterior: prev?.status ?? null, valor_novo: 'Resolvido'
            });
            if (modal.closeModal) modal.closeModal();
            apply();
          });
          return;
        }
      });
    }
  };

  bindGridEvents();
  apply();
}