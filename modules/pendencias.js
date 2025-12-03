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
  const triRespRaw = Array.isArray(p.pendencia_triagem) ? (p.pendencia_triagem[0]?.tecnico_responsavel ?? '') : (p.pendencia_triagem?.tecnico_responsavel ?? '');
  const triResp = triRespRaw || triRelato || '';
  const motivoRej = Array.isArray(p.pendencia_triagem) ? (p.pendencia_triagem[0]?.motivo_rejeicao ?? '') : (p.pendencia_triagem?.motivo_rejeicao ?? '');
  const clienteNome = clienteMap[p.cliente_id] ?? p.cliente_id ?? '';
  const titulo = String(p.descricao ?? '');
  const tituloAttr = titulo.replace(/"/g, '&quot;');
  const moduloPair = (moduloMap[p.modulo_id] ?? p.modulo_id ?? '') + (p.release_versao ? '/' + p.release_versao : '');
  return `
    <tr data-id="${p.id}">
      <td><input type="checkbox" class="sel" /></td>
      <td><a href="#/pendencia?id=${p.id}" class="link">${p.id}</a></td>
      <td title="${tituloAttr}">${clienteNome}</td>
      <td>${moduloPair}</td>
      <td>${p.tipo}</td>
      <td class="col-tech-relato">${triRelato ?? ''}</td>
      <td class="col-tech-triagem">${Array.isArray(p.pendencia_triagem) ? (p.pendencia_triagem[0]?.tecnico_triagem ?? '') : (p.pendencia_triagem?.tecnico_triagem ?? '')}</td>
      <td class="col-tech-resp">${triResp ?? ''}</td>
      <td><span class="prio ${p.prioridade}" aria-label="${p.prioridade}">${p.prioridade}</span></td>
      <td>
        <span class="status ${p.status}" aria-label="${p.status}" ${p.status === 'Rejeitada' && motivoRej ? `title="Motivo: ${sanitizeText(motivoRej)}"` : ''}>${p.status}</span>
        ${p.status === 'Rejeitada' && motivoRej ? `<div class="hint">Motivo: ${sanitizeText(motivoRej)}</div>` : ''}
      </td>
      <td>${daysSince(p.data_relato)}</td>
      <td>${formatDateBr(p.data_relato)}</td>
      <td>
        <button class="btn success" data-act="res">Resolver</button>
        <button class="btn info" data-act="clone">Clonar</button>
        <button class="btn os" data-act="os">O.S.</button>
        <button class="btn light-warning" data-act="edit">Editar</button>
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
    .select('*, pendencia_triagem(tecnico_relato, tecnico_triagem, tecnico_responsavel, motivo_rejeicao)')
    .order('created_at', { ascending: false });
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.tipo) q = q.eq('tipo', filters.tipo);
  if (filters.modulo_id) q = q.eq('modulo_id', Number(filters.modulo_id));
  if (filters.cliente_id) q = q.eq('cliente_id', filters.cliente_id);
  // Pesquisa livre por nome do cliente usando cache local de clientes
  if (!filters.cliente_id && filters.cliente_like) {
    const allClientes = storage.get('clientes') || [];
    const term = String(filters.cliente_like).toLowerCase();
    const ids = allClientes
      .filter(c => String(c.nome || '').toLowerCase().includes(term))
      .map(c => c.id_cliente);
    if (ids.length === 0) {
      // Nenhum cliente corresponde; retorna lista vazia sem consultar o servidor
      return { data: [], error: null, count: 0 };
    }
    q = q.in('cliente_id', ids);
  }
  // filtro por técnico (responsável) será aplicado client-side usando pendencia_triagem.tecnico_responsavel
  if (filters.data_ini) q = q.gte('data_relato', filters.data_ini);
  if (filters.data_fim) q = q.lte('data_relato', filters.data_fim);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await q
    .range(from, to)
    .select('*, pendencia_triagem(tecnico_relato, tecnico_triagem, tecnico_responsavel, motivo_rejeicao)', { count: 'exact' });
  return { data: data ?? [], error, count: count ?? 0 };
}

function formHtml(clientes) {
  const clienteOptions = clientes.map(c => `<option value="${c.nome}"></option>`).join('');
  const user = session.get();
  return `
  <div class="card">
    <h3>Nova Pendência</h3>
    <form id="pForm" class="form pend-form">
      <div class="tabs" role="tablist" style="display:flex; gap:8px; margin-bottom:8px;">
        <button type="button" class="tab active" data-tab="dados">Dados</button>
        <button type="button" class="tab" data-tab="solucao">Solução/Orientação</button>
        <button type="button" class="tab" data-tab="anexos">Anexos</button>
      </div>
      <div id="tabContentDados" data-tab-content="dados">
      <div class="row">
        <div class="col-4 field">
          <label>Cliente</label>
          <input name="cliente_nome" class="input" placeholder="Cliente (nome)" list="clientesFormList" />
          <datalist id="clientesFormList">${clienteOptions}</datalist>
        </div>
        <div class="col-4 field">
          <label>Módulo</label>
          <select class="input" name="modulo_id" required id="moduloSel"></select>
        </div>
        <div class="col-4 field">
          <label>Versão/Relesase</label>
          <input class="input" name="release_versao" placeholder="Versão/Relesase" />
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
            <option>Outro</option>
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
      <div class="toolbar" style="justify-content:flex-start; margin:8px 0;">
        <button type="button" class="btn secondary type-tab" data-type="Programação">🛠 Programação</button>
        <button type="button" class="btn secondary type-tab" data-type="Suporte">🧩 Suporte</button>
        <button type="button" class="btn secondary type-tab" data-type="Implantação">🚀 Implantação</button>
        <button type="button" class="btn secondary type-tab" data-type="Atualizacao">🔄 Atualização</button>
        <button type="button" class="btn secondary type-tab" data-type="Outro">📁 Outro</button>
      </div>
      <details class="card" id="grpPS" style="margin-top:8px" open>
        <summary style="font-weight:700">📋 Programação & Suporte</summary>
        <div class="field">
          <label>Situação: Informe o problema, bug, modificação ou melhoria</label>
          <textarea class="input" name="situacao"></textarea>
        </div>
        <div class="field">
          <label>Etapas: Como reproduzir a situação?</label>
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
      </details>
      <details class="card" id="grpImpl" style="margin-top:8px">
        <summary style="font-weight:700">🚀 Implantação</summary>
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
      </details>
      <details class="card" id="grpAtual" style="margin-top:8px">
        <summary style="font-weight:700">🔄 Atualização</summary>
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
      </details>
      <details class="card" id="grpOutro" style="margin-top:8px">
        <summary style="font-weight:700">📁 Outra Pendência</summary>
        <div class="field">
          <label>Outra Pendencia<br />Situação: Informe pendencia comercial, financeira, treinamento ou outra qualquer</label>
          <textarea class="input" name="situacao"></textarea>
        </div>
      </details>
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
      <div id="tabContentAnexos" data-tab-content="anexos" style="display:none;">
        <div class="card" style="margin-top:8px;">
          <h4>📎 Anexos</h4>
          <div class="row">
            <div class="col-6 field">
              <label>Descrição</label>
              <input class="input" id="anexDesc" placeholder="Descrição do anexo" />
            </div>
            <div class="col-6 field">
              <label>URL</label>
              <input class="input" id="anexUrl" type="url" placeholder="https://..." />
            </div>
          </div>
          <div class="row">
            <div class="col-4 field">
              <label>Nome do arquivo</label>
              <input class="input" id="anexNome" />
            </div>
            <div class="col-4 field">
              <label>Tipo do arquivo</label>
              <input class="input" id="anexTipo" />
            </div>
            <div class="col-4 field">
              <label>Categoria</label>
              <select class="input" id="anexCat">
                <option value="">(sem categoria)</option>
                <option value="banco_de_dados">Banco de dados</option>
                <option value="certificado_digital">Certificado digital</option>
                <option value="log_erros">Log de erros</option>
                <option value="documentacao">Documentação</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>
          <div class="toolbar" style="justify-content:flex-end; gap:8px;">
            <button type="button" class="btn" id="anexClear">Limpar</button>
            <button type="button" class="btn primary" id="anexAdd">Adicionar</button>
          </div>
          <div id="anexMsg" class="hint"></div>
        </div>
        <div class="card" style="margin-top:8px;">
          <div class="section-head info">Anexos cadastrados</div>
          <div style="height:240px; overflow:auto;">
            <table class="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Categoria</th>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Descrição</th>
                  <th>URL</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="anexosTbody"></tbody>
            </table>
          </div>
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
  const clienteOptions = clientes.map(c => `<option value="${c.nome}"></option>`).join('');
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
        <option>Outro</option>
      </select>
      <select id="fModulo" class="input">${moduloOptions}</select>
      <input id="fCliente" class="input" placeholder="Cliente (nome)" list="clientesList" />
      <datalist id="clientesList">${clienteOptions}</datalist>
      <select id="fTecnico" class="input">${tecnicoOptions}</select>
      <input id="fDataIni" class="input" type="date" />
      <input id="fDataFim" class="input" type="date" />
      <select id="fRangePreset" class="input" title="Período rápido">
        <option value="ultimos_7" selected>Últimos 7 dias</option>
        <option value="ultimos_15">Últimos 15 dias</option>
        <option value="ultimos_30">Últimos 30 dias</option>
        <option value="hoje">Hoje</option>
        <option value="semana_atual">Semana atual</option>
        <option value="proxima_semana">Próxima semana</option>
        <option value="mes_atual">Mês atual</option>
        <option value="este_trimestre">Este trimestre</option>
      </select>
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
            <th>Técnico Triagem</th>
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

  // Persisted view mode
  const savedView = storage.get('pendencias_view', 'grid');
  if (savedView === 'kanban' || savedView === 'grid') state.viewMode = savedView;

  // Helper: captura filtros dos inputs
  const captureFilters = () => {
    const f = {
      status: sanitizeText(document.getElementById('fStatus').value) || undefined,
      tipo: sanitizeText(document.getElementById('fTipo').value) || undefined,
      modulo_id: sanitizeText(document.getElementById('fModulo').value) || undefined,
      tecnico: sanitizeText(document.getElementById('fTecnico').value) || undefined,
      data_ini: toDate(document.getElementById('fDataIni').value) || undefined,
      data_fim: toDate(document.getElementById('fDataFim').value) || undefined,
    };
    const nome = sanitizeText(document.getElementById('fCliente').value).trim();
    if (nome) {
      const all = storage.get('clientes') || [];
      const hit = all.find(c => String(c.nome || '').toLowerCase() === nome.toLowerCase());
      if (hit) f.cliente_id = hit.id_cliente; else f.cliente_like = nome;
    }
    return f;
  };
  
  // Try to restore saved filters, otherwise default: últimos 7 dias
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
  const presetEl = document.getElementById('fRangePreset');
  const savedFilters = storage.get('pendencias_filters', null);
  if (savedFilters && typeof savedFilters === 'object') {
    // Restore inputs
    const setVal = (id, val) => { const el = document.getElementById(id); if (el != null && val != null) el.value = String(val); };
    setVal('fStatus', savedFilters.status || '');
    setVal('fTipo', savedFilters.tipo || '');
    setVal('fModulo', savedFilters.modulo_id || '');
    setVal('fTecnico', savedFilters.tecnico || '');
    if (iniEl) iniEl.value = savedFilters.data_ini || '';
    if (fimEl) fimEl.value = savedFilters.data_fim || '';
    const clienteNome = (savedFilters.cliente_id && clienteMap[savedFilters.cliente_id]) ? clienteMap[savedFilters.cliente_id] : (savedFilters.cliente_like || '');
    setVal('fCliente', clienteNome);
    state.filters = savedFilters;
  } else {
    if (iniEl) iniEl.value = iniStr;
    if (fimEl) fimEl.value = fimStr;
    if (presetEl) presetEl.value = 'ultimos_7';
    state.filters.data_ini = iniStr;
    state.filters.data_fim = fimStr;
    // Persist defaults with long TTL (30 days)
    storage.set('pendencias_filters', { data_ini: iniStr, data_fim: fimStr }, 30 * 24 * 60 * 60 * 1000);
  }

  const renderViewArea = () => {
    const area = document.getElementById('viewArea');
    area.innerHTML = state.viewMode === 'grid' ? gridHtml() : kanbanHtml();
    if (state.viewMode === 'grid') bindGridEvents();
  };

  const apply = async () => {
    const { data, count } = await fetchPendencias(state.filters, state.page, state.limit);
    let rows = data;
    const fTec = state.filters?.tecnico || '';
    if (fTec) {
      const term = String(fTec).toLowerCase();
      rows = rows.filter(p => {
        const tri = Array.isArray(p.pendencia_triagem) ? p.pendencia_triagem[0] : p.pendencia_triagem;
        const resp = String(tri?.tecnico_responsavel || '').toLowerCase();
        return resp.includes(term);
      });
    }
    state.data = rows;
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
    const cardHtml = (p) => {
      const prioridade = String(p.prioridade || '').toLowerCase();
      const isCritica = /^cr[ií]t/.test(prioridade);
      const alert = isCritica
        ? '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" style="margin-right:6px;flex:0 0 auto" title="Crítica"><polygon points="12,2 22,20 2,20" fill="#FFEB3B" stroke="#000" stroke-width="2"></polygon><text x="12" y="17" text-anchor="middle" font-size="16" font-weight="700" fill="#000">!</text></svg>'
        : '';
      return `
        <div class="card" style="padding:8px;">
          <div style="font-weight:600; margin-bottom:4px; display:flex; align-items:center;">
            ${alert}
            <span>${clienteMap[p.cliente_id] ?? p.cliente_id ?? ''} • <a href="#/pendencia?id=${p.id}" class="link">${p.id}</a></span>
          </div>
          <div class="hint" style="margin-bottom:4px;">${(Array.isArray(p.pendencia_triagem) ? (p.pendencia_triagem[0]?.tecnico_responsavel ?? '') : (p.pendencia_triagem?.tecnico_responsavel ?? '')) || (Array.isArray(p.pendencia_triagem) ? (p.pendencia_triagem[0]?.tecnico_relato ?? '') : (p.pendencia_triagem?.tecnico_relato ?? ''))}</div>
          <div style="font-size:12px;">${sanitizeText(p.descricao) || ''}</div>
        </div>
      `;
    };
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
    // Persist filters (30 days)
    storage.set('pendencias_filters', state.filters, 30 * 24 * 60 * 60 * 1000);
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
    if (presetEl) presetEl.value = 'ultimos_7';
    // Reset lógico mantendo “últimos 7 dias”
    state.filters = { data_ini: ini, data_fim: fim };
    state.page = 1;
    storage.set('pendencias_filters', state.filters, 30 * 24 * 60 * 60 * 1000);
    debouncedApply();
  });

  // Alternar Grid/Kanban
  document.getElementById('toggleView').addEventListener('click', () => {
    state.viewMode = state.viewMode === 'grid' ? 'kanban' : 'grid';
    storage.set('pendencias_view', state.viewMode, 30 * 24 * 60 * 60 * 1000);
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
    const relInput = modal.querySelector('input[name="release_versao"]');
    const grpPS = modal.querySelector('#grpPS');
    const grpImpl = modal.querySelector('#grpImpl');
    const grpAtual = modal.querySelector('#grpAtual');
    const grpOutro = modal.querySelector('#grpOutro');
    const updateGroupsByType = () => {
      const tipo = (tipoSel?.value || '').trim();
      const showPS = tipo === 'Programação' || tipo === 'Suporte';
      const showImpl = tipo === 'Implantação';
      const showAtual = tipo === 'Atualizacao';
      const showOutro = tipo === 'Outro';
      if (grpPS) { grpPS.style.display = showPS ? '' : 'none'; grpPS.open = showPS; }
      if (grpImpl) { grpImpl.style.display = showImpl ? '' : 'none'; grpImpl.open = showImpl; }
      if (grpAtual) { grpAtual.style.display = showAtual ? '' : 'none'; grpAtual.open = showAtual; }
      if (grpOutro) { grpOutro.style.display = showOutro ? '' : 'none'; grpOutro.open = showOutro; }
    };
    updateGroupsByType();
    const enforceReleaseRequired = () => {
      const t = (tipoSel?.value || '').trim();
      if (relInput) {
        relInput.required = (t === 'Programação');
        const lbl = relInput.closest('.field')?.querySelector('label');
        if (lbl) lbl.textContent = 'Versão/Relesase' + (t === 'Programação' ? ' (obrigatório)' : '');
      }
    };
    enforceReleaseRequired();
    if (tipoSel) tipoSel.addEventListener('change', () => { updateGroupsByType(); updateTypeTabs(); enforceReleaseRequired(); });
    const typeTabs = modal.querySelectorAll('.type-tab');
    const updateTypeTabs = () => {
      const cur = (tipoSel?.value || '').trim();
      typeTabs.forEach(btn => {
        const isActive = btn.getAttribute('data-type') === cur;
        btn.classList.toggle('primary', isActive);
        btn.classList.toggle('secondary', !isActive);
      });
    };
    updateTypeTabs();
    typeTabs.forEach(btn => btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-type');
      if (tipoSel) tipoSel.value = t;
      updateGroupsByType();
      updateTypeTabs();
      enforceReleaseRequired();
    }));
    const anexBinder = bindAnexosTab(modal, null);
    // Salvar
    const form = modal.querySelector('#pForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const getLast = (name) => {
        const arr = fd.getAll(name) || [];
        const val = arr.slice().reverse().find(v => v && String(v).trim().length);
        return val || null;
      };
      const nomeCliente = (fd.get('cliente_nome') || '').trim();
      const hitCliente = (clientes || []).find(c => String(c.nome || '').toLowerCase() === nomeCliente.toLowerCase());
      if (!hitCliente) {
        const msgEl = modal.querySelector('#pFormMsg');
        if (msgEl) msgEl.textContent = 'Selecione um cliente válido da lista.';
        return;
      }
      const tipoVal = fd.get('tipo');
      const releaseVal = String(fd.get('release_versao') || '').trim();
      if (tipoVal === 'Programação' && !releaseVal) {
        const msgEl = modal.querySelector('#pFormMsg');
        if (msgEl) msgEl.textContent = 'Informe a Versão/Relesase para tipo Programação.';
        return;
      }
      const payload = {
        cliente_id: hitCliente.id_cliente,
        modulo_id: Number(fd.get('modulo_id')),
        release_versao: releaseVal || null,
        tipo: fd.get('tipo'),
        prioridade: fd.get('prioridade'),
        status: 'Triagem',
        data_relato: fd.get('data_relato'),
        previsao_conclusao: fd.get('previsao_conclusao') || null,
        descricao: fd.get('descricao'),
        link_trello: fd.get('link_trello') || null,
        // Campos existentes no banco
        situacao: getLast('situacao'),
        etapas_reproducao: getLast('etapas_reproducao'),
        frequencia: getLast('frequencia'),
        informacoes_adicionais: getLast('informacoes_adicionais'),
        escopo: getLast('escopo'),
        objetivo: getLast('objetivo'),
        recursos_necessarios: getLast('recursos_necessarios'),
        solucao_orientacao: getLast('solucao_orientacao'),
      };
      const supabase = getSupabase();
      // Inserir pendência e obter ID para criar registro de triagem
      const { data: inserted, error } = await supabase
        .from('pendencias')
        .insert(payload)
        .select('id')
        .single();
      const msgEl = modal.querySelector('#pFormMsg');
      if (error) {
        if (msgEl) msgEl.textContent = 'Erro ao salvar: ' + error.message;
        return;
      }
      // Criar (ou garantir) registro em pendencia_triagem com técnico do relato
      try {
        const pendId = inserted?.id;
        if (pendId) {
          const { data: existing } = await supabase
            .from('pendencia_triagem')
            .select('pendencia_id')
            .eq('pendencia_id', pendId)
            .maybeSingle();
          const tecnicoRelato = (fd.get('tecnico') || '').trim();
          if (existing) {
            await supabase.from('pendencia_triagem').update({ tecnico_relato: tecnicoRelato }).eq('pendencia_id', pendId);
          } else {
            await supabase.from('pendencia_triagem').insert({ pendencia_id: pendId, tecnico_relato: tecnicoRelato });
          }
          await anexBinder.persistAll(pendId);
        }
      } catch {}
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
    storage.set('pendencias_filters', state.filters, 30 * 24 * 60 * 60 * 1000);
    debouncedApply();
  }, 250);
  ['fStatus','fTipo','fModulo','fCliente','fTecnico','fDataIni','fDataFim'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', updateFilters);
    el.addEventListener('input', updateFilters);
  });

  // Presets de período
  const computeRange = (key) => {
    const t = new Date();
    const toY = (d) => toYMD(d);
    if (key === 'hoje') {
      const d = new Date(t);
      return { ini: toY(d), fim: toY(d) };
    }
    if (key === 'ultimos_7') {
      const s = new Date(t); s.setDate(t.getDate() - 7);
      return { ini: toY(s), fim: toY(t) };
    }
    if (key === 'ultimos_15') {
      const s = new Date(t); s.setDate(t.getDate() - 15);
      return { ini: toY(s), fim: toY(t) };
    }
    if (key === 'ultimos_30') {
      const s = new Date(t); s.setDate(t.getDate() - 30);
      return { ini: toY(s), fim: toY(t) };
    }
    if (key === 'semana_atual') {
      const dow = t.getDay(); // 0 dom, 1 seg, ...
      const offsetToMon = (dow + 6) % 7; // seg=0
      const start = new Date(t); start.setDate(t.getDate() - offsetToMon);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return { ini: toY(start), fim: toY(end) };
    }
    if (key === 'proxima_semana') {
      const dow = t.getDay();
      const offsetToMon = (dow + 6) % 7;
      const nextMon = new Date(t); nextMon.setDate(t.getDate() - offsetToMon + 7);
      const end = new Date(nextMon); end.setDate(nextMon.getDate() + 6);
      return { ini: toY(nextMon), fim: toY(end) };
    }
    if (key === 'mes_atual') {
      const start = new Date(t.getFullYear(), t.getMonth(), 1);
      const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
      return { ini: toY(start), fim: toY(end) };
    }
    if (key === 'este_trimestre') {
      const month = t.getMonth();
      const quarterStartMonth = Math.floor(month / 3) * 3;
      const start = new Date(t.getFullYear(), quarterStartMonth, 1);
      const end = new Date(t.getFullYear(), quarterStartMonth + 3, 0);
      return { ini: toY(start), fim: toY(end) };
    }
    return { ini: iniStr, fim: fimStr };
  };
  if (presetEl) presetEl.addEventListener('change', () => {
    const { ini, fim } = computeRange(presetEl.value);
    if (iniEl) iniEl.value = ini;
    if (fimEl) fimEl.value = fim;
    state.filters.data_ini = ini;
    state.filters.data_fim = fim;
    state.page = 1;
    storage.set('pendencias_filters', state.filters, 30 * 24 * 60 * 60 * 1000);
    debouncedApply();
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
          const [{ data: pend }, { data: tri }] = await Promise.all([
            supabase.from('pendencias').select('*').eq('id', id).maybeSingle(),
            supabase.from('pendencia_triagem').select('tecnico_relato').eq('pendencia_id', id).maybeSingle()
          ]);
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
          setVal(modal.querySelector('input[name="cliente_nome"]'), clienteMap[pend?.cliente_id] ?? '');
          setVal(modSel, pend?.modulo_id ?? '');
          setVal(modal.querySelector('input[name="release_versao"]'), pend?.release_versao ?? '');
          setVal(modal.querySelector('select[name="tipo"]'), pend?.tipo ?? '');
          setVal(modal.querySelector('select[name="prioridade"]'), pend?.prioridade ?? '');
          setVal(tecSel, tri?.tecnico_relato ?? '');
          if (tecSel) tecSel.disabled = String(pend?.status || '').trim() !== 'Triagem';
          const toYMD = (d) => {
            if (!d) return '';
            if (typeof d === 'string') {
              const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
              if (m) return m[1];
            }
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
          modal.querySelectorAll('textarea[name="situacao"]').forEach(el => setVal(el, pend?.situacao ?? ''));
          modal.querySelectorAll('textarea[name="etapas_reproducao"]').forEach(el => setVal(el, pend?.etapas_reproducao ?? ''));
          const freqEl = modal.querySelector('input[name="frequencia"]');
          setVal(freqEl, pend?.frequencia ?? '');
          modal.querySelectorAll('textarea[name="informacoes_adicionais"]').forEach(el => setVal(el, pend?.informacoes_adicionais ?? ''));
          modal.querySelectorAll('textarea[name="escopo"]').forEach(el => setVal(el, pend?.escopo ?? ''));
          modal.querySelectorAll('textarea[name="objetivo"]').forEach(el => setVal(el, pend?.objetivo ?? ''));
          modal.querySelectorAll('textarea[name="recursos_necessarios"]').forEach(el => setVal(el, pend?.recursos_necessarios ?? ''));
          const solEl = modal.querySelector('textarea[name="solucao_orientacao"]');
          setVal(solEl, pend?.solucao_orientacao ?? '');
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
          const relInput = modal.querySelector('input[name="release_versao"]');
          const grpPS = modal.querySelector('#grpPS');
          const grpImpl = modal.querySelector('#grpImpl');
          const grpAtual = modal.querySelector('#grpAtual');
          const grpOutro = modal.querySelector('#grpOutro');
          const updateGroupsByType = () => {
            const tipo = (tipoSel?.value || '').trim();
            const showPS = tipo === 'Programação' || tipo === 'Suporte';
            const showImpl = tipo === 'Implantação';
            const showAtual = tipo === 'Atualizacao';
            const showOutro = tipo === 'Outro';
            if (grpPS) { grpPS.style.display = showPS ? '' : 'none'; grpPS.open = showPS; }
            if (grpImpl) { grpImpl.style.display = showImpl ? '' : 'none'; grpImpl.open = showImpl; }
            if (grpAtual) { grpAtual.style.display = showAtual ? '' : 'none'; grpAtual.open = showAtual; }
            if (grpOutro) { grpOutro.style.display = showOutro ? '' : 'none'; grpOutro.open = showOutro; }
          };
          updateGroupsByType();
          const enforceReleaseRequired = () => {
            const t = (tipoSel?.value || '').trim();
            if (relInput) {
              relInput.required = (t === 'Programação');
              const lbl = relInput.closest('.field')?.querySelector('label');
              if (lbl) lbl.textContent = 'Versão/Relesase' + (t === 'Programação' ? ' (obrigatório)' : '');
            }
          };
          enforceReleaseRequired();
          if (tipoSel) tipoSel.addEventListener('change', () => { updateGroupsByType(); updateTypeTabs(); enforceReleaseRequired(); });
          const typeTabs = modal.querySelectorAll('.type-tab');
          const updateTypeTabs = () => {
            const cur = (tipoSel?.value || '').trim();
            typeTabs.forEach(btn => {
              const isActive = btn.getAttribute('data-type') === cur;
              btn.classList.toggle('primary', isActive);
              btn.classList.toggle('secondary', !isActive);
            });
          };
          updateTypeTabs();
          typeTabs.forEach(btn => btn.addEventListener('click', () => {
            const t = btn.getAttribute('data-type');
            if (tipoSel) tipoSel.value = t;
            updateGroupsByType();
            updateTypeTabs();
            enforceReleaseRequired();
          }));
          const anexBinder = bindAnexosTab(modal, id);
          // Salvar (update)
          const form = modal.querySelector('#pForm');
          const msgEl = modal.querySelector('#pFormMsg');
          form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const fd = new FormData(form);
            const nomeCliente = (fd.get('cliente_nome') || '').trim();
            const hitCliente = (clientes || []).find(c => String(c.nome || '').toLowerCase() === nomeCliente.toLowerCase());
            if (!hitCliente) {
              if (msgEl) msgEl.textContent = 'Selecione um cliente válido da lista.';
              return;
            }
            const tipoVal = fd.get('tipo');
            const releaseVal = String(fd.get('release_versao') || '').trim();
            if (tipoVal === 'Programação' && !releaseVal) { if (msgEl) msgEl.textContent = 'Informe a Versão/Relesase para tipo Programação.'; return; }
            const payload = {
              cliente_id: hitCliente.id_cliente,
              modulo_id: Number(fd.get('modulo_id')),
              release_versao: releaseVal || null,
              tipo: fd.get('tipo'),
              prioridade: fd.get('prioridade'),
              data_relato: fd.get('data_relato'),
              previsao_conclusao: fd.get('previsao_conclusao') || null,
              descricao: fd.get('descricao'),
              link_trello: fd.get('link_trello') || null,
              // Campos existentes
              situacao: (() => { const a = fd.getAll('situacao') || []; const v = a.slice().reverse().find(x => x && String(x).trim().length); return v || null; })(),
              etapas_reproducao: (() => { const a = fd.getAll('etapas_reproducao') || []; const v = a.slice().reverse().find(x => x && String(x).trim().length); return v || null; })(),
              frequencia: (() => { const a = fd.getAll('frequencia') || []; const v = a.slice().reverse().find(x => x && String(x).trim().length); return v || null; })(),
              informacoes_adicionais: (() => { const a = fd.getAll('informacoes_adicionais') || []; const v = a.slice().reverse().find(x => x && String(x).trim().length); return v || null; })(),
              escopo: (() => { const a = fd.getAll('escopo') || []; const v = a.slice().reverse().find(x => x && String(x).trim().length); return v || null; })(),
              objetivo: (() => { const a = fd.getAll('objetivo') || []; const v = a.slice().reverse().find(x => x && String(x).trim().length); return v || null; })(),
              recursos_necessarios: (() => { const a = fd.getAll('recursos_necessarios') || []; const v = a.slice().reverse().find(x => x && String(x).trim().length); return v || null; })(),
              solucao_orientacao: (() => { const a = fd.getAll('solucao_orientacao') || []; const v = a.slice().reverse().find(x => x && String(x).trim().length); return v || null; })(),
            };
            const { error } = await supabase.from('pendencias').update(payload).eq('id', id);
            if (error) {
              if (msgEl) msgEl.textContent = 'Erro ao salvar: ' + error.message;
              return;
            }
            const tecnicoRelato = (fd.get('tecnico') || '').trim();
            const prevRelato = tri?.tecnico_relato || '';
            if (String(pend?.status || '').trim() === 'Triagem' && tecnicoRelato && tecnicoRelato !== prevRelato) {
              await supabase.from('pendencia_triagem').update({ tecnico_relato: tecnicoRelato }).eq('pendencia_id', id);
              await supabase.from('pendencia_historicos').insert({
                pendencia_id: id,
                usuario: session.get()?.nome || tecnicoRelato,
                acao: 'Técnico do Relato alterado',
                campo_alterado: 'tecnico_relato',
                valor_anterior: prevRelato || null,
                valor_novo: tecnicoRelato
              });
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
              .select('status, descricao')
              .eq('id', id)
              .maybeSingle();
          const { data: triUser } = await supabase
              .from('pendencia_triagem')
              .select('tecnico_responsavel, tecnico_relato')
              .eq('pendencia_id', id)
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
          
            const usuario = session.get()?.nome || triUser?.tecnico_responsavel || triUser?.tecnico_relato || '—';
            await supabase.from('pendencia_triagem').update({ tecnico_responsavel: usuario }).eq('pendencia_id', id);
            await supabase.from('pendencias').update({ status: 'Resolvido', solucao_orientacao: sol }).eq('id', id);
            await supabase.from('pendencia_historicos').insert({
              pendencia_id: id, acao: 'Pendência resolvida', usuario,
              campo_alterado: 'status', valor_anterior: prev?.status ?? null, valor_novo: 'Resolvido'
            });
            if (modal.closeModal) modal.closeModal();
            apply();
          });
          return;
        } else if (act === 'clone') {
          const [{ data: pend }, { data: tri }] = await Promise.all([
            supabase.from('pendencias').select('*').eq('id', id).maybeSingle(),
            supabase.from('pendencia_triagem').select('tecnico_relato').eq('pendencia_id', id).maybeSingle()
          ]);
          const modal = openModal(formHtml(clientes));
          // Popular selects
          const modSel = modal.querySelector('#moduloSel');
          const tecSel = modal.querySelector('#tecnicoSel');
          if (modSel) modSel.innerHTML = ['<option value="">Selecione...</option>', ...modulos.map(m => `<option value="${m.id}">${m.nome}</option>`)].join('');
          if (tecSel) tecSel.innerHTML = ['<option value="">Selecione...</option>', ...usuarios.map(u => `<option value="${u.nome}">${u.nome}</option>`)].join('');
          // Prefill campos básicos
          const setVal = (sel, val) => { if (sel && val != null) sel.value = String(val); };
          setVal(modal.querySelector('input[name="cliente_nome"]'), clienteMap[pend?.cliente_id] ?? '');
          setVal(modSel, pend?.modulo_id ?? '');
          setVal(modal.querySelector('input[name="release_versao"]'), '');
          setVal(modal.querySelector('select[name="tipo"]'), pend?.tipo ?? '');
          setVal(modal.querySelector('select[name="prioridade"]'), pend?.prioridade ?? '');
          setVal(tecSel, tri?.tecnico_relato ?? '');
          // Datas: hoje por padrão
          const toYMD = (d) => { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; };
          const dr = modal.querySelector('input[name="data_relato"]');
          if (dr) dr.value = toYMD(new Date());
          // Limpar campos não clonados
          setVal(modal.querySelector('input[name="previsao_conclusao"]'), '');
          setVal(modal.querySelector('input[name="descricao"]'), '');
          setVal(modal.querySelector('input[name="link_trello"]'), '');
          modal.querySelectorAll('textarea[name="situacao"]').forEach(el => el.value = '');
          modal.querySelectorAll('textarea[name="etapas_reproducao"]').forEach(el => el.value = '');
          modal.querySelectorAll('input[name="frequencia"]').forEach(el => el.value = '');
          modal.querySelectorAll('textarea[name="informacoes_adicionais"]').forEach(el => el.value = '');
          modal.querySelectorAll('textarea[name="escopo"]').forEach(el => el.value = '');
          modal.querySelectorAll('textarea[name="objetivo"]').forEach(el => el.value = '');
          modal.querySelectorAll('textarea[name="recursos_necessarios"]').forEach(el => el.value = '');
          const solEl = modal.querySelector('textarea[name="solucao_orientacao"]'); if (solEl) solEl.value = '';
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
          const relInput = modal.querySelector('input[name="release_versao"]');
          const grpPS = modal.querySelector('#grpPS');
          const grpImpl = modal.querySelector('#grpImpl');
          const grpAtual = modal.querySelector('#grpAtual');
          const grpOutro = modal.querySelector('#grpOutro');
          const updateGroupsByType = () => {
            const tipo = (tipoSel?.value || '').trim();
            const showPS = tipo === 'Programação' || tipo === 'Suporte';
            const showImpl = tipo === 'Implantação';
            const showAtual = tipo === 'Atualizacao';
            const showOutro = tipo === 'Outro';
            if (grpPS) { grpPS.style.display = showPS ? '' : 'none'; grpPS.open = showPS; }
            if (grpImpl) { grpImpl.style.display = showImpl ? '' : 'none'; grpImpl.open = showImpl; }
            if (grpAtual) { grpAtual.style.display = showAtual ? '' : 'none'; grpAtual.open = showAtual; }
            if (grpOutro) { grpOutro.style.display = showOutro ? '' : 'none'; grpOutro.open = showOutro; }
          };
          updateGroupsByType();
          const enforceReleaseRequiredClone = () => {
            const t = (tipoSel?.value || '').trim();
            if (relInput) {
              relInput.required = (t === 'Programação');
              const lbl = relInput.closest('.field')?.querySelector('label');
              if (lbl) lbl.textContent = 'Versão/Relesase' + (t === 'Programação' ? ' (obrigatório)' : '');
            }
          };
          enforceReleaseRequiredClone();
          if (tipoSel) tipoSel.addEventListener('change', () => { updateGroupsByType(); enforceReleaseRequiredClone(); });
          // Sincronizar abas de tipo
          const typeTabs = modal.querySelectorAll('.type-tab');
          const updateTypeTabs = () => {
            const cur = (tipoSel?.value || '').trim();
            typeTabs.forEach(btn => {
              const isActive = btn.getAttribute('data-type') === cur;
              btn.classList.toggle('primary', isActive);
              btn.classList.toggle('secondary', !isActive);
            });
          };
          updateTypeTabs();
          typeTabs.forEach(btn => btn.addEventListener('click', () => {
            const t = btn.getAttribute('data-type');
            if (tipoSel) tipoSel.value = t;
            updateGroupsByType();
            updateTypeTabs();
            enforceReleaseRequiredClone();
          }));
          if (tipoSel) { tipoSel.dispatchEvent(new Event('change')); }

          // Salvar (create) reaproveitando lógica de "Novo"
          const form = modal.querySelector('#pForm');
          const anexBinder = bindAnexosTab(modal, null);
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(form);
            const getLast = (name) => {
              const arr = fd.getAll(name) || [];
              const val = arr.slice().reverse().find(v => v && String(v).trim().length);
              return val || null;
            };
            const nomeCliente = (fd.get('cliente_nome') || '').trim();
            const hitCliente = (clientes || []).find(c => String(c.nome || '').toLowerCase() === nomeCliente.toLowerCase());
            const msgEl = modal.querySelector('#pFormMsg');
            if (!hitCliente) {
              if (msgEl) msgEl.textContent = 'Selecione um cliente válido da lista.';
              return;
            }
            const tipoVal = fd.get('tipo');
            const releaseVal = String(fd.get('release_versao') || '').trim();
            if (tipoVal === 'Programação' && !releaseVal) { if (msgEl) msgEl.textContent = 'Informe a Versão/Relesase para tipo Programação.'; return; }
            const payload = {
              cliente_id: hitCliente.id_cliente,
              modulo_id: Number(fd.get('modulo_id')),
              release_versao: releaseVal || null,
              tipo: fd.get('tipo'),
              prioridade: fd.get('prioridade'),
              status: 'Triagem',
              data_relato: fd.get('data_relato'),
              previsao_conclusao: fd.get('previsao_conclusao') || null,
              descricao: fd.get('descricao'),
              link_trello: fd.get('link_trello') || null,
              situacao: getLast('situacao'),
              etapas_reproducao: getLast('etapas_reproducao'),
              frequencia: getLast('frequencia'),
              informacoes_adicionais: getLast('informacoes_adicionais'),
              escopo: getLast('escopo'),
              objetivo: getLast('objetivo'),
              recursos_necessarios: getLast('recursos_necessarios'),
              solucao_orientacao: getLast('solucao_orientacao'),
            };
            const supa = getSupabase();
            const { data: inserted, error } = await supa
              .from('pendencias')
              .insert(payload)
              .select('id')
              .single();
            if (error) { if (msgEl) msgEl.textContent = 'Erro ao salvar: ' + error.message; return; }
            try {
              const pendId = inserted?.id;
              if (pendId) {
                const { data: existing } = await supa
                  .from('pendencia_triagem')
                  .select('pendencia_id')
                  .eq('pendencia_id', pendId)
                  .maybeSingle();
                const tecnicoRelato = (fd.get('tecnico') || '').trim();
                if (existing) {
                  await supa.from('pendencia_triagem').update({ tecnico_relato: tecnicoRelato }).eq('pendencia_id', pendId);
                } else {
                  await supa.from('pendencia_triagem').insert({ pendencia_id: pendId, tecnico_relato: tecnicoRelato });
                }
                await anexBinder.persistAll(pendId);
              }
            } catch {}
            if (msgEl) msgEl.textContent = 'Pendência criada com sucesso.';
            if (modal.closeModal) modal.closeModal();
            state.page = 1;
            await apply();
          });
        } else if (act === 'os') {
          const { data: pend } = await supabase.from('pendencias').select('*').eq('id', id).maybeSingle();
          const formatPendId = (val) => {
            const s = String(val ?? '');
            const raw = s.replace(/^ID-/, '');
            return 'ID-' + String(raw).padStart(5, '0');
          };
          const pid = formatPendId(id);
          const clienteNome = clienteMap[pend?.cliente_id] ?? pend?.cliente_id ?? '—';
        const moduloNome = moduloMap[pend?.modulo_id] ?? pend?.modulo_id ?? '—';
        const moduloPair = String(moduloNome) + (pend?.release_versao ? '/' + pend.release_versao : '');
        const tipo = pend?.tipo || '—';
        const prio = pend?.prioridade || '—';
        const { data: triOS } = await supabase
          .from('pendencia_triagem')
          .select('tecnico_responsavel, tecnico_relato')
          .eq('pendencia_id', id)
          .maybeSingle();
        const tecnico = triOS?.tecnico_responsavel || triOS?.tecnico_relato || '—';
        const status = pend?.status || '—';
        const dataAbertura = formatDateBr(pend?.data_relato);
          const prevLabel = status === 'Resolvido' ? 'Data Conclusão' : 'Previsão de Conclusão';
          const prevValue = pend?.previsao_conclusao ? formatDateBr(pend?.previsao_conclusao) : 'a definir';
          const hojeStr = formatDateBr(new Date());
          const fileTitle = `CS_OS_Pendência_${id}`;
          const titulo = String(pend?.descricao || '').trim();

          const blocoPS = `
            <tr><th>Situação</th><td class='pre'>${sanitizeText(pend?.situacao ?? '—')}</td></tr>
            <tr><th>Etapas</th><td class='pre'>${sanitizeText(pend?.etapas_reproducao ?? '—')}</td></tr>
            <tr><th>Frequência</th><td>${sanitizeText(pend?.frequencia ?? '—')}</td></tr>
            <tr><th>Informações</th><td class='pre'>${sanitizeText(pend?.informacoes_adicionais ?? '—')}</td></tr>
          `;
          const blocoImpl = `
            <tr><th>Escopo</th><td class='pre'>${sanitizeText(pend?.escopo ?? '—')}</td></tr>
            <tr><th>Objetivo</th><td class='pre'>${sanitizeText(pend?.objetivo ?? '—')}</td></tr>
            <tr><th>Recursos</th><td class='pre'>${sanitizeText(pend?.recursos_necessarios ?? '—')}</td></tr>
            <tr><th>Informações</th><td class='pre'>${sanitizeText(pend?.informacoes_adicionais ?? '—')}</td></tr>
          `;
          const blocoAtual = `
            <tr><th>Escopo</th><td class='pre'>${sanitizeText(pend?.escopo ?? '—')}</td></tr>
            <tr><th>Motivação</th><td class='pre'>${sanitizeText(pend?.objetivo ?? '—')}</td></tr>
            <tr><th>Impacto</th><td class='pre'>${sanitizeText(pend?.informacoes_adicionais ?? '—')}</td></tr>
            <tr><th>Requisitos específicos</th><td class='pre'>${sanitizeText(pend?.recursos_necessarios ?? '—')}</td></tr>
          `;
          const blocoOutro = `
            <tr><th>Situação</th><td class='pre'>${sanitizeText(pend?.situacao ?? '—')}</td></tr>
          `;
          const extra =
            tipo === 'Programação' || tipo === 'Suporte' ? blocoPS :
            tipo === 'Implantação' ? blocoImpl :
            tipo === 'Atualizacao' ? blocoAtual :
            tipo === 'Outro' ? blocoOutro : '';

          const modal = openModal(`
            <div class='card'>
              <h3>Ordem de Serviço — ${pid}${titulo ? ` • ${sanitizeText(titulo)}` : ''}</h3>
              <div>
                <table class='details-table'>
                  <tbody>
                    <tr><th>Cliente</th><td>${sanitizeText(clienteNome)}</td></tr>
                    <tr><th>Módulo/Release</th><td>${sanitizeText(moduloPair)}</td></tr>
                    <tr><th>Tipo</th><td>${sanitizeText(tipo)}</td></tr>
                    <tr><th>Técnico</th><td>${sanitizeText(tecnico)}</td></tr>
                    <tr><th>Prioridade</th><td><span class='prio ${prio}' aria-label='${prio}'>${prio}</span></td></tr>
                    <tr><th>Data Abertura</th><td>${dataAbertura}</td></tr>
                    <tr><th>${prevLabel}</th><td>${prevValue}</td></tr>
                    <tr><th>Título</th><td class='pre'>${sanitizeText(titulo)}</td></tr>
                    ${extra}
                    <tr><th>Data atual</th><td>${hojeStr}</td></tr>
                  </tbody>
                </table>
              </div>
              <div class='toolbar' style='justify-content:flex-end'>
                <button class='btn' id='osFechar'>Fechar</button>
                <button class='btn' id='osCopiar'>Copiar</button>
                <button class='btn warning' id='osImprimir'>Imprimir</button>
              </div>
            </div>
          `);

          const osText = [
            `Ordem de Serviço — ${pid}${titulo ? ` • ${titulo}` : ''}`,
            `Cliente: ${clienteNome}`,
            `Módulo/Release: ${moduloPair}`,
            `Tipo: ${tipo}`,
            `Técnico: ${tecnico}`,
            `Prioridade: ${prio}`,
            `Data Abertura: ${dataAbertura}`,
            `${prevLabel}: ${prevValue}`,
            `Título: ${titulo}`,
            tipo === 'Programação' || tipo === 'Suporte' ? [
              `Situação: ${pend?.situacao ?? '—'}`,
              `Etapas: ${pend?.etapas_reproducao ?? '—'}`,
              `Frequência: ${pend?.frequencia ?? '—'}`,
              `Informações: ${pend?.informacoes_adicionais ?? '—'}`
            ].join('\n')
            : tipo === 'Implantação' ? [
              `Escopo: ${pend?.escopo ?? '—'}`,
              `Objetivo: ${pend?.objetivo ?? '—'}`,
              `Recursos: ${pend?.recursos_necessarios ?? '—'}`,
              `Informações: ${pend?.informacoes_adicionais ?? '—'}`
            ].join('\n')
            : tipo === 'Atualizacao' ? [
              `Escopo: ${pend?.escopo ?? '—'}`,
              `Motivação: ${pend?.objetivo ?? '—'}`,
              `Impacto: ${pend?.informacoes_adicionais ?? '—'}`,
              `Requisitos específicos: ${pend?.recursos_necessarios ?? '—'}`
            ].join('\n') : tipo === 'Outro' ? [
              `Situação: ${pend?.situacao ?? '—'}`
            ].join('\n') : '',
            `Data atual: ${hojeStr}`
          ].filter(Boolean).join('\n');

          const closeBtn = modal.querySelector('#osFechar');
          if (closeBtn && modal.closeModal) closeBtn.addEventListener('click', () => modal.closeModal());

          const copyBtn = modal.querySelector('#osCopiar');
          if (copyBtn) copyBtn.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(osText); alert('Ordem de Serviço copiada.'); }
            catch { alert('Não foi possível copiar.'); }
          });

          const printBtn = modal.querySelector('#osImprimir');
          if (printBtn) printBtn.addEventListener('click', () => {
            const css = `
              @page { margin: 18mm; }
              body { font-family: Segoe UI, Arial, sans-serif; color: #000; }
              .os-header { text-align: center; margin-bottom: 10mm; }
              .os-title { font-size: 20px; font-weight: 700; border-bottom: 2px solid #000; display: inline-block; padding: 4px 12px; }
              .os-section { margin-bottom: 6mm; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
              th { background: #f2f2f2; font-weight: 700; text-align: left; }
              .os-meta-table th { width: 160px; }
              .box { border: 1px solid #000; padding: 10px; min-height: 28mm; }
              .pre { white-space: pre-wrap; }
              .sign { margin-top: 10mm; }
              .sign-row { display: flex; align-items: center; gap: 10mm; margin-top: 8mm; }
              .sign-line { border-top: 1px solid #000; flex: 1; }
              .sign-label { width: 60mm; text-align: center; }
            `;
            const html = `
              <html><head><title>${fileTitle}</title><style>${css}</style></head>
              <body>
                <div class="os-header">
                  <div class="os-title">Ordem de Serviço Nº ${pid}</div>
                </div>
                <div class="os-section">
                  <table class="os-meta-table">
                    <tbody>
                      <tr>
                        <th>Número da OS</th><td>${pid}</td>
                        <th>Data Abertura</th><td>${dataAbertura}</td>
                        <th>${prevLabel}</th><td>${prevValue}</td>
                      </tr>
                      <tr>
                        <th>Cliente</th><td colspan="5">${sanitizeText(clienteNome)}</td>
                      </tr>
                      <tr>
                        <th>Tipo de Serviço</th><td colspan="2">${sanitizeText(tipo)}</td>
                        <th>Técnico</th><td colspan="2">${sanitizeText(tecnico)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="os-section">
                  <table>
                    <tbody>
                      <tr><th>Título</th><td class="pre">${sanitizeText(titulo)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div class="os-section">
                  <table>
                    <tbody>
                      ${extra}
                    </tbody>
                  </table>
                </div>
                <div class="sign">
                  <table>
                    <tbody>
                      <tr><th>Data atual</th><td>${hojeStr}</td></tr>
                    </tbody>
                  </table>
                  <div class="sign-row"><div class="sign-line"></div><div class="sign-label">Assinatura do responsável</div></div>
                  <div class="sign-row"><div class="sign-line"></div><div class="sign-label">Assinatura do cliente</div></div>
                </div>
              </body></html>`;
            const frame = document.createElement('iframe');
            frame.style.position = 'fixed'; frame.style.right = '0'; frame.style.bottom = '0';
            frame.style.width = '0'; frame.style.height = '0'; frame.style.border = '0';
            frame.srcdoc = html;
            document.body.appendChild(frame);
            const prevTitle = document.title;
            const cleanup = () => { try { document.body.removeChild(frame); document.title = prevTitle; } catch {} };
            frame.onload = () => {
              const w = frame.contentWindow;
              if (!w) { cleanup(); return; }
              try { w.document.title = fileTitle; } catch {}
              document.title = fileTitle;
              w.focus();
              w.onafterprint = cleanup;
              w.print();
              setTimeout(cleanup, 5000);
            };
          });
        }
      });
    }
  };

  renderViewArea();
  apply();
}

function bindAnexosTab(modal, pendId) {
  const supabase = getSupabase();
  let anexos = [];
  const descEl = modal.querySelector('#anexDesc');
  const urlEl = modal.querySelector('#anexUrl');
  const nomeEl = modal.querySelector('#anexNome');
  const tipoEl = modal.querySelector('#anexTipo');
  const catEl = modal.querySelector('#anexCat');
  const addBtn = modal.querySelector('#anexAdd');
  const clrBtn = modal.querySelector('#anexClear');
  const msgEl = modal.querySelector('#anexMsg');
  const tbody = modal.querySelector('#anexosTbody');

  const clearForm = () => {
    if (descEl) descEl.value = '';
    if (urlEl) urlEl.value = '';
    if (nomeEl) nomeEl.value = '';
    if (tipoEl) tipoEl.value = '';
    if (catEl) catEl.value = '';
  };

  const render = () => {
    const rows = (anexos || []).map((a, i) => {
      const ds = a.data_anexo ? new Date(a.data_anexo).toLocaleString('pt-BR') : '';
      const url = a.url_anexo ? `<a href="${sanitizeText(a.url_anexo)}" target="_blank">${sanitizeText(a.url_anexo)}</a>` : '';
      return `
        <tr data-idx="${i}" data-id="${a.id || ''}">
          <td>${sanitizeText(ds)}</td>
          <td>${sanitizeText(a.categoria || '')}</td>
          <td>${sanitizeText(a.nome_arquivo || '')}</td>
          <td>${sanitizeText(a.tipo_arquivo || '')}</td>
          <td>${sanitizeText(a.descricao || '')}</td>
          <td>${url}</td>
          <td>
            <button class="btn warning" data-act="delAnexo">Excluir</button>
          </td>
        </tr>`;
    }).join('');
    if (tbody) tbody.innerHTML = rows;
  };

  const getPayloadFromForm = () => {
    const categoria = (catEl?.value || '').trim();
    return {
      descricao: (descEl?.value || '').trim(),
      url_anexo: (urlEl?.value || '').trim(),
      nome_arquivo: ((nomeEl?.value || '').trim()) || null,
      tipo_arquivo: ((tipoEl?.value || '').trim()) || null,
      categoria: categoria || null
    };
  };

  if (addBtn) addBtn.addEventListener('click', async () => {
    const p = getPayloadFromForm();
    if (!p.descricao || !p.url_anexo) { if (msgEl) msgEl.textContent = 'Informe descrição e URL'; return; }
    if (pendId) {
      const { data, error } = await supabase.from('pendencia_anexos').insert({ ...p, pendencia_id: pendId }).select('*').single();
      if (error) { if (msgEl) msgEl.textContent = 'Erro ao adicionar: ' + error.message; return; }
      anexos.unshift(data);
    } else {
      anexos.unshift({ ...p });
    }
    render();
    clearForm();
    if (msgEl) msgEl.textContent = '';
  });

  if (clrBtn) clrBtn.addEventListener('click', () => { clearForm(); });

  if (tbody) tbody.addEventListener('click', async (e) => {
    const act = e.target.getAttribute('data-act');
    if (!act) return;
    const tr = e.target.closest('tr');
    const idx = Number(tr.getAttribute('data-idx'));
    const id = tr.getAttribute('data-id');
    if (act === 'delAnexo') {
      if (id && pendId) {
        const { error } = await supabase.from('pendencia_anexos').delete().eq('id', id);
        if (error) { if (msgEl) msgEl.textContent = 'Erro ao excluir: ' + error.message; return; }
      }
      anexos.splice(idx, 1);
      render();
    }
  });

  const loadExisting = async () => {
    if (!pendId) return;
    const { data } = await supabase
      .from('pendencia_anexos')
      .select('*')
      .eq('pendencia_id', pendId)
      .order('data_anexo', { ascending: false });
    anexos = data || [];
    render();
  };
  loadExisting();

  return {
    getStaged: () => (anexos || []).filter(a => !a.id),
    persistAll: async (pid) => {
      if (!pid) return;
      const staged = (anexos || []).filter(a => !a.id);
      for (const s of staged) {
        await supabase.from('pendencia_anexos').insert({ ...s, pendencia_id: pid }).select('*');
      }
    }
  };
}
