import { viewMount, confirmDialog } from './ui.js';
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
  return `
    <tr data-id="${p.id}">
      <td><input type="checkbox" class="sel" /></td>
      <td><a href="#/pendencia?id=${p.id}" class="link">${p.id}</a></td>
      <td>${clienteMap[p.cliente_id] ?? p.cliente_id ?? ''}</td>
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
          <textarea class="input" name="informacoes_implantacao"></textarea>
        </div>
      </div>
      <div class="card" id="grpAtual" style="margin-top:8px">
        <h4>🔄 Atualização</h4>
        <div class="field">
          <label>Escopo: O que será atualizado?</label>
          <textarea class="input" name="escopo_atual"></textarea>
        </div>
        <div class="field">
          <label>Motivação: Por que esta atualização?</label>
          <textarea class="input" name="motivacao"></textarea>
        </div>
        <div class="field">
          <label>Impacto: Qual o impacto nos usuários?</label>
          <textarea class="input" name="impacto"></textarea>
        </div>
        <div class="field">
          <label>Informações: Requisitos específicos (Versao a atualizar (de/para), Windows/Linux, Banco de dados etc) </label>
          <textarea class="input" name="requisitos_especificos"></textarea>
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
       <option>Aguardando o Cliente</option>
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
      <button class="btn" id="applyFilters">Aplicar filtros</button>
      <button class="btn" id="clearFilters">Limpar</button>
      <button class="btn primary" id="novoBtn">Novo</button>
    </div>
  </div>`;
}

function gridHtml() {
  return `
  <div class="card" id="virtWrap" style="height:clamp(420px, 66vh, 800px); overflow:auto;">
    <table class="table" id="pTable">
      <thead><tr>
        <th><input type="checkbox" id="selAll" /></th>
        <th>ID</th><th>Cliente</th><th>Módulo</th><th>Tipo</th><th class="col-tech-relato">Téc. Relato</th><th class="col-tech-resp">Responsável</th><th>Prioridade</th><th>Status</th><th>Dias</th><th>Data</th><th>Ações</th>
      </tr></thead>
      <tbody></tbody>
    </table>
    <div id="spacer" style="height:0px"></div>
    <div class="toolbar">
      <button class="btn" id="prevPage">Anterior</button>
      <div id="pageInfo" class="hint"></div>
      <button class="btn" id="nextPage">Próxima</button>
    </div>
  </div>`;
}

export async function render() {
  const v = viewMount();
  const clientes = await listClientes();
  const modulos = await listModulos();
  // Buscar lista de usuários ativos para popular o filtro de técnico
  const supabaseUsers = getSupabase();
  const { data: usuarios } = await supabaseUsers.from('usuarios').select('nome').eq('ativo', true).order('nome');
  const user = session.get();
  clienteMap = Object.fromEntries((clientes || []).map(c => [c.id_cliente, c.nome]));
  moduloMap = Object.fromEntries((modulos || []).map(m => [m.id, m.nome]));
  v.innerHTML = `
    <div class="grid">
      <div class="col-12"><div class="hint">Usuário logado: ${user?.nome ?? '—'}</div></div>
      <div class="col-12">${filtersHtml(clientes, usuarios || [], modulos || [])}</div>
      <div class="col-12">${gridHtml()}</div>
    </div>
  `;

  const state = { page: 1, limit: 200, filters: {}, data: [] };

  const apply = async () => {
    const { data, count } = await fetchPendencias(state.filters, state.page, state.limit);
    state.data = data;
    document.getElementById('pageInfo').textContent = `Página ${state.page} • ${count} registros (virtual ${state.data.length})`;
    renderVirtual();
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

  const debouncedApply = debounce(apply, 300);

  document.getElementById('applyFilters').addEventListener('click', () => debouncedApply());
  document.getElementById('clearFilters').addEventListener('click', () => {
    state.filters = {}; state.page = 1; debouncedApply();
  });
  document.getElementById('prevPage').addEventListener('click', () => { state.page = Math.max(1, state.page - 1); apply(); });
  document.getElementById('nextPage').addEventListener('click', () => { state.page += 1; apply(); });
  document.getElementById('virtWrap').addEventListener('scroll', debounce(renderVirtual, 10));
  document.getElementById('selAll').addEventListener('change', (e) => {
    document.querySelectorAll('#pTable tbody .sel').forEach(cb => cb.checked = e.target.checked);
  });

  const updateFilters = debounce(() => {
    const filters = {
      status: sanitizeText(document.getElementById('fStatus').value) || undefined,
      tipo: sanitizeText(document.getElementById('fTipo').value) || undefined,
      modulo_id: sanitizeText(document.getElementById('fModulo').value) || undefined,
      cliente_id: sanitizeText(document.getElementById('fCliente').value) || undefined,
      tecnico: sanitizeText(document.getElementById('fTecnico').value) || undefined,
      data_ini: toDate(document.getElementById('fDataIni').value) || undefined,
      data_fim: toDate(document.getElementById('fDataFim').value) || undefined,
    };
    state.filters = filters;
    state.page = 1;
    debouncedApply();
  }, 250);
  ['fStatus','fTipo','fModulo','fCliente','fTecnico','fDataIni','fDataFim'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', updateFilters);
    el.addEventListener('input', updateFilters);
  });

  document.getElementById('novoBtn').addEventListener('click', async () => {
    const { openModal } = await import('./ui.js');
    const m = openModal(formHtml(clientes));
    // Tabs: alternância entre Dados e Solução
    const tabs = m.querySelectorAll('.tab');
    const contents = m.querySelectorAll('[data-tab-content]');
    tabs.forEach(btn => btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      contents.forEach(c => c.style.display = c.getAttribute('data-tab-content') === tab ? 'block' : 'none');
    }));
    // Preencher opções de módulo com nomes
    const mods = await listModulos();
    const moduloSel = m.querySelector('#moduloSel');
    moduloSel.innerHTML = ['<option value="">Selecione...</option>', ...mods.map(m => `<option value="${m.id}">${m.nome}</option>`)].join('');
    const closeBtn = m.querySelector('#closeModalBtn');
    if (closeBtn) closeBtn.addEventListener('click', () => { if (typeof m.closeModal === 'function') m.closeModal(); });
    // Preencher técnicos com base na tabela usuarios
    const supabaseUsers = getSupabase();
    const { data: usuarios } = await supabaseUsers.from('usuarios').select('nome').eq('ativo', true).order('nome');
    const tecnicoSel = m.querySelector('#tecnicoSel');
    const currentUser = session.get();
    tecnicoSel.innerHTML = ['<option value="">Selecione...</option>', ...(usuarios ?? []).map(u => `<option value="${u.nome}">${u.nome}</option>`)].join('');
    if (currentUser?.nome) {
      const target = String(currentUser.nome).trim().toLowerCase();
      let matched = false;
      Array.from(tecnicoSel.options).forEach(opt => {
        if (String(opt.value).trim().toLowerCase() === target) {
          tecnicoSel.value = opt.value;
          matched = true;
        }
      });
      if (!matched && target.length) {
        const opt = document.createElement('option');
        opt.value = currentUser.nome;
        opt.textContent = currentUser.nome;
        tecnicoSel.insertBefore(opt, tecnicoSel.options[1]);
        tecnicoSel.value = currentUser.nome;
      }
    }
    // padrões de tipo e prioridade
    const tipoSelDefault = m.querySelector('select[name="tipo"]');
    const prioridadeSelDefault = m.querySelector('select[name="prioridade"]');
    if (tipoSelDefault) tipoSelDefault.value = 'Suporte';
    if (prioridadeSelDefault) prioridadeSelDefault.value = 'Media';
    // comportamento adaptativo por tipo
    const tipoSel = m.querySelector('select[name="tipo"]');
    const grpPS = m.querySelector('#grpPS');
    const grpImpl = m.querySelector('#grpImpl');
    const grpAtual = m.querySelector('#grpAtual');
    const updateGroups = () => {
      const t = tipoSel.value;
      grpPS.style.display = (t === 'Programação' || t === 'Suporte') ? 'block' : 'none';
      grpImpl.style.display = (t === 'Implantação') ? 'block' : 'none';
      grpAtual.style.display = (t === 'Atualizacao') ? 'block' : 'none';
      // required flags
      const setReq = (names, required) => names.forEach(n => {
        const el = m.querySelector(`[name="${n}"]`);
        if (el) el.required = required;
      });
      // base: titulo sempre obrigatório
      setReq(['descricao'], true);
      // reset all specifics
      setReq(['situacao','etapas_reproducao','frequencia','informacoes_adicionais','escopo','objetivo','recursos_necessarios','informacoes_implantacao','escopo_atual','motivacao','impacto','requisitos_especificos'], false);
      if (t === 'Programação' || t === 'Suporte') {
        setReq(['situacao','etapas_reproducao','frequencia'], true);
      } else if (t === 'Implantação') {
        setReq(['escopo','objetivo'], true);
      } else if (t === 'Atualizacao') {
        setReq(['escopo_atual','motivacao','impacto'], true);
      }
    };
    tipoSel.addEventListener('change', updateGroups);
    updateGroups();
    // Data do relato: default hoje (YYYY-MM-DD)
    const dr = m.querySelector('input[name="data_relato"]');
    if (dr) {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      dr.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    }
    const form = m.querySelector('#pForm');
    const msg = m.querySelector('#pFormMsg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = 'Salvando...';
      const fd = new FormData(form);
      const tipoVal = sanitizeText(fd.get('tipo'));
      let obrig = ['descricao'];
      if (tipoVal === 'Programação' || tipoVal === 'Suporte') {
        obrig = obrig.concat(['situacao','etapas_reproducao','frequencia']);
      } else if (tipoVal === 'Implantação') {
        obrig = obrig.concat(['escopo','objetivo']);
      } else if (tipoVal === 'Atualizacao') {
        obrig = obrig.concat(['escopo_atual','motivacao','impacto']);
      }
      const faltando = obrig.filter(k => !sanitizeText(fd.get(k)));
      if (faltando.length) { msg.textContent = 'Preencha os campos obrigatórios: ' + faltando.join(', '); return; }
      const payload = {
        cliente_id: Number(fd.get('cliente_id')) || null,
        modulo_id: Number(fd.get('modulo_id')),
        tipo: sanitizeText(fd.get('tipo')),
        descricao: sanitizeText(fd.get('descricao')),
        link_trello: sanitizeText(fd.get('link_trello')),
        // Programação & Suporte
        situacao: sanitizeText(fd.get('situacao')),
        etapas_reproducao: sanitizeText(fd.get('etapas_reproducao')),
        frequencia: sanitizeText(fd.get('frequencia')),
        informacoes_adicionais: sanitizeText(fd.get('informacoes_adicionais')) || sanitizeText(fd.get('impacto')) || sanitizeText(fd.get('informacoes_implantacao')),
        // Implantação
        escopo: sanitizeText(fd.get('escopo')) || sanitizeText(fd.get('escopo_atual')),
        objetivo: sanitizeText(fd.get('objetivo')) || sanitizeText(fd.get('motivacao')),
        recursos_necessarios: sanitizeText(fd.get('recursos_necessarios')) || sanitizeText(fd.get('requisitos_especificos')),
        solucao_orientacao: sanitizeText(fd.get('solucao_orientacao')),
        tecnico: sanitizeText(fd.get('tecnico')),
        data_relato: toDate(fd.get('data_relato')),
        previsao_conclusao: toDate(fd.get('previsao_conclusao')),
        prioridade: sanitizeText(fd.get('prioridade')),
        status: 'Triagem',
      };
      try {
        const supabase = getSupabase();
        const { data: created, error } = await supabase.from('pendencias').insert(payload).select('id').single();
        if (error) throw error;
        // Criar registro de triagem vinculando técnico do relato
        const { error: triErr } = await supabase.from('pendencia_triagem').insert({ pendencia_id: created.id, tecnico_relato: payload.tecnico });
        if (triErr) throw triErr;
        msg.textContent = 'Salvo com sucesso';
        form.reset();
        apply();
      } catch (err) { msg.textContent = 'Erro: ' + err.message; }
    });
  });

  const inlineForm = document.getElementById('pForm');
  if (inlineForm) {
    inlineForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('pFormMsg');
      msg.textContent = 'Salvando...';
      const form = new FormData(e.target);
      const payload = {
        cliente_id: Number(form.get('cliente_id')) || null,
        modulo_id: Number(form.get('modulo_id')),
        tipo: sanitizeText(form.get('tipo')),
        descricao: sanitizeText(form.get('descricao')),
        link_trello: sanitizeText(form.get('link_trello')),
        solucao_orientacao: sanitizeText(form.get('solucao_orientacao')),
        tecnico: sanitizeText(form.get('tecnico')),
        data_relato: toDate(form.get('data_relato')),
        previsao_conclusao: toDate(form.get('previsao_conclusao')),
        prioridade: sanitizeText(form.get('prioridade')),
        status: sanitizeText(form.get('status')),
      };
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('pendencias').insert(payload);
        if (error) throw error;
        msg.textContent = 'Salvo com sucesso';
        e.target.reset();
        apply();
      } catch (err) {
        msg.textContent = 'Erro: ' + err.message;
      }
    });
  }

  document.querySelector('#pTable').addEventListener('click', async (e) => {
    const act = e.target.getAttribute('data-act');
    if (!act) return;
    const tr = e.target.closest('tr');
    const id = tr.getAttribute('data-id');
    const supabase = getSupabase();
    if (act === 'del') {
      const ok = await confirmDialog(`Você está prestes a excluir a pendência ${id}. Esta ação é permanente.`);
      if (!ok) return;
      await supabase.from('pendencias').delete().eq('id', id);
      apply();
    }
    if (act === 'res') {
      const ok = await confirmDialog(`Você irá resolver a pendência ${id}. Você pode registrar uma solução/orientação antes de concluir.`);
      if (!ok) return;
      // Abrir modal de edição focado apenas em Solução/Orientação
      const { openModal } = await import('./ui.js');
      const m = openModal(formHtml(clientes));
      m.querySelector('h3').textContent = `Resolver Pendência #${id}`;
      const closeBtn = m.querySelector('#closeModalBtn');
      if (closeBtn) closeBtn.addEventListener('click', () => { if (typeof m.closeModal === 'function') m.closeModal(); });
      // Preencher opções de módulo e técnicos, mas desabilitar edição
      const moduloSel = m.querySelector('#moduloSel');
      moduloSel.innerHTML = ['<option value="">Selecione...</option>', ...Object.entries(moduloMap).map(([val, nome]) => `<option value="${val}">${nome}</option>`)].join('');
      const supabaseUsers = getSupabase();
      const { data: usuariosEdit } = await supabaseUsers.from('usuarios').select('nome').eq('ativo', true).order('nome');
      const tecnicoSel = m.querySelector('#tecnicoSel');
      tecnicoSel.innerHTML = ['<option value="">Selecione...</option>', ...(usuariosEdit ?? []).map(u => `<option value="${u.nome}">${u.nome}</option>`)].join('');
      // Carregar pendência e preencher campos
      const { data: pend } = await supabase.from('pendencias').select('*').eq('id', id).maybeSingle();
      // Atualizar cabeçalho com título para ajudar o operador
      if (pend && pend.descricao) {
        const h = m.querySelector('h3');
        if (h) h.textContent = `Resolver Pendência #${id} — ${pend.descricao}`;
      }
      const setVal = (name, value) => { const el = m.querySelector(`[name="${name}"]`); if (el && value !== undefined && value !== null) el.value = value; };
      ['cliente_id','modulo_id','tipo','prioridade','tecnico','data_relato','previsao_conclusao','descricao','link_trello','situacao','etapas_reproducao','frequencia','informacoes_adicionais','escopo','objetivo','recursos_necessarios'].forEach(n => setVal(n, pend?.[n] ?? ''));
      setVal('informacoes_implantacao', pend?.informacoes_adicionais ?? '');
      setVal('escopo_atual', pend?.escopo ?? '');
      setVal('motivacao', pend?.objetivo ?? '');
      setVal('impacto', pend?.informacoes_adicionais ?? '');
      setVal('requisitos_especificos', pend?.recursos_necessarios ?? '');
      setVal('solucao_orientacao', pend?.solucao_orientacao ?? '');
      // Status exibido e bloqueado
      const statusSel = m.querySelector('select[name="status"]');
      if (statusSel) { statusSel.disabled = true; statusSel.innerHTML = `<option selected>${pend?.status ?? 'Triagem'}</option>`; }
      // Tabs: mostrar apenas Solução
      const tabs = m.querySelectorAll('.tab');
      const contents = m.querySelectorAll('[data-tab-content]');
      tabs.forEach(b => b.classList.remove('active'));
      const solBtn = Array.from(tabs).find(b => b.getAttribute('data-tab') === 'solucao');
      if (solBtn) solBtn.classList.add('active');
      contents.forEach(c => c.style.display = c.getAttribute('data-tab-content') === 'solucao' ? 'block' : 'none');
      // Desabilitar edição de todos os campos, exceto solucao_orientacao
      Array.from(m.querySelectorAll('input, select, textarea')).forEach(el => {
        if (el.getAttribute('name') !== 'solucao_orientacao') el.disabled = true;
      });
      const solEl = m.querySelector('[name="solucao_orientacao"]');
      if (solEl) { solEl.required = true; solEl.focus(); }
      const form = m.querySelector('#pForm');
      const msg = m.querySelector('#pFormMsg');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        msg.textContent = 'Salvando e resolvendo...';
        const fd = new FormData(form);
        const textoSolucao = sanitizeText(fd.get('solucao_orientacao'));
        if (!textoSolucao) { msg.textContent = 'Informe a solução/orientação antes de resolver.'; return; }
        const payload = {
          solucao_orientacao: textoSolucao,
          status: 'Resolvido',
        };
        try {
          // buscar status anterior para histórico
          const { data: prev } = await supabase.from('pendencias').select('status, tecnico').eq('id', id).maybeSingle();
          const usuario = session.get()?.nome || prev?.tecnico || '—';
          const { error } = await supabase.from('pendencias').update(payload).eq('id', id);
          if (error) throw error;
          await supabase.from('pendencia_historicos').insert({
            pendencia_id: id, acao: 'Pendência resolvida', usuario,
            campo_alterado: 'status', valor_anterior: prev?.status ?? null, valor_novo: 'Resolvido'
          });
          msg.textContent = 'Resolvido com sucesso';
          apply();
          if (typeof m.closeModal === 'function') m.closeModal();
        } catch (err) {
          msg.textContent = 'Erro: ' + err.message;
        }
      });
    }
    if (act === 'edit') {
      const { openModal } = await import('./ui.js');
      const m = openModal(formHtml(clientes));
      m.querySelector('h3').textContent = `Editar Pendência #${id}`;
      const closeBtn = m.querySelector('#closeModalBtn');
      if (closeBtn) closeBtn.addEventListener('click', () => { if (typeof m.closeModal === 'function') m.closeModal(); });
      // opções de módulo
      const moduloSel = m.querySelector('#moduloSel');
      moduloSel.innerHTML = ['<option value="">Selecione...</option>', ...Object.entries(moduloMap).map(([val, nome]) => `<option value="${val}">${nome}</option>`)].join('');
      // opções de técnicos
      const supabaseUsers = getSupabase();
      const { data: usuariosEdit } = await supabaseUsers.from('usuarios').select('nome').eq('ativo', true).order('nome');
      const tecnicoSel = m.querySelector('#tecnicoSel');
      tecnicoSel.innerHTML = ['<option value="">Selecione...</option>', ...(usuariosEdit ?? []).map(u => `<option value="${u.nome}">${u.nome}</option>`)].join('');
      // carregar pendência
      const { data: pend } = await supabase.from('pendencias').select('*').eq('id', id).maybeSingle();
      const setVal = (name, value) => { const el = m.querySelector(`[name="${name}"]`); if (el && value !== undefined && value !== null) el.value = value; };
      setVal('cliente_id', pend?.cliente_id ?? '');
      setVal('modulo_id', pend?.modulo_id ?? '');
      setVal('tipo', pend?.tipo ?? 'Suporte');
      setVal('prioridade', pend?.prioridade ?? 'Media');
      setVal('tecnico', pend?.tecnico ?? '');
      setVal('data_relato', pend?.data_relato ?? '');
      setVal('previsao_conclusao', pend?.previsao_conclusao ?? '');
      setVal('descricao', pend?.descricao ?? '');
      setVal('link_trello', pend?.link_trello ?? '');
      setVal('situacao', pend?.situacao ?? '');
      setVal('etapas_reproducao', pend?.etapas_reproducao ?? '');
      setVal('frequencia', pend?.frequencia ?? '');
      // Valores comuns salvos na tabela
      setVal('informacoes_adicionais', pend?.informacoes_adicionais ?? '');
      setVal('escopo', pend?.escopo ?? '');
      setVal('objetivo', pend?.objetivo ?? '');
      setVal('recursos_necessarios', pend?.recursos_necessarios ?? '');
      // Preencher campos específicos por tipo a partir dos campos comuns
      if (pend?.tipo === 'Implantação') {
        // Campo de "Informações" da implantação é salvo em informacoes_adicionais
        setVal('informacoes_implantacao', pend?.informacoes_adicionais ?? '');
      } else if (pend?.tipo === 'Atualizacao') {
        // Mapear comuns -> específicos para atualização
        setVal('escopo_atual', pend?.escopo ?? '');
        setVal('motivacao', pend?.objetivo ?? '');
        setVal('impacto', pend?.informacoes_adicionais ?? '');
        setVal('requisitos_especificos', pend?.recursos_necessarios ?? '');
      }
      // Novo campo: solução/orientação
      setVal('solucao_orientacao', pend?.solucao_orientacao ?? '');
      // status apenas exibe (não editável)
      const statusSel = m.querySelector('select[name="status"]');
      if (statusSel) { statusSel.disabled = true; statusSel.innerHTML = `<option selected>${pend?.status ?? 'Triagem'}</option>`; }
      // habilitar grupos e required
      const tipoSel = m.querySelector('select[name="tipo"]');
      const grpPS = m.querySelector('#grpPS');
      const grpImpl = m.querySelector('#grpImpl');
      const grpAtual = m.querySelector('#grpAtual');
      const updateGroupsEdit = () => {
        const t = tipoSel.value;
        grpPS.style.display = (t === 'Programação' || t === 'Suporte') ? 'block' : 'none';
        grpImpl.style.display = (t === 'Implantação') ? 'block' : 'none';
        grpAtual.style.display = (t === 'Atualizacao') ? 'block' : 'none';
        const setReq = (names, required) => names.forEach(n => { const el = m.querySelector(`[name="${n}"]`); if (el) el.required = required; });
        setReq(['descricao'], true);
        setReq(['situacao','etapas_reproducao','frequencia','informacoes_adicionais','escopo','objetivo','recursos_necessarios','informacoes_implantacao','escopo_atual','motivacao','impacto','requisitos_especificos'], false);
        if (t === 'Programação' || t === 'Suporte') setReq(['situacao','etapas_reproducao','frequencia'], true);
        else if (t === 'Implantação') setReq(['escopo','objetivo'], true);
        else if (t === 'Atualizacao') setReq(['escopo_atual','motivacao','impacto'], true);
      };
      tipoSel.addEventListener('change', updateGroupsEdit);
      updateGroupsEdit();
      const form = m.querySelector('#pForm');
      const msg = m.querySelector('#pFormMsg');
      // Tabs comportamento para edição
      const tabs = m.querySelectorAll('.tab');
      const contents = m.querySelectorAll('[data-tab-content]');
      tabs.forEach(btn => btn.addEventListener('click', () => {
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        contents.forEach(c => c.style.display = c.getAttribute('data-tab-content') === tab ? 'block' : 'none');
      }));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        msg.textContent = 'Salvando...';
        const fd = new FormData(form);
        const tipoVal = sanitizeText(fd.get('tipo'));
        let obrig = ['descricao'];
        if (tipoVal === 'Programação' || tipoVal === 'Suporte') obrig = obrig.concat(['situacao','etapas_reproducao','frequencia']);
        else if (tipoVal === 'Implantação') obrig = obrig.concat(['escopo','objetivo']);
        else if (tipoVal === 'Atualizacao') obrig = obrig.concat(['escopo_atual','motivacao','impacto']);
        const faltando = obrig.filter(k => !sanitizeText(fd.get(k)));
        if (faltando.length) { msg.textContent = 'Preencha os campos obrigatórios: ' + faltando.join(', '); return; }
        const payload = {
          cliente_id: Number(fd.get('cliente_id')) || null,
          modulo_id: Number(fd.get('modulo_id')),
          tipo: sanitizeText(fd.get('tipo')),
          descricao: sanitizeText(fd.get('descricao')),
          link_trello: sanitizeText(fd.get('link_trello')),
          situacao: sanitizeText(fd.get('situacao')),
          etapas_reproducao: sanitizeText(fd.get('etapas_reproducao')),
          frequencia: sanitizeText(fd.get('frequencia')),
          informacoes_adicionais: sanitizeText(fd.get('informacoes_adicionais')) || sanitizeText(fd.get('impacto')) || sanitizeText(fd.get('informacoes_implantacao')),
          escopo: sanitizeText(fd.get('escopo')) || sanitizeText(fd.get('escopo_atual')),
          objetivo: sanitizeText(fd.get('objetivo')) || sanitizeText(fd.get('motivacao')),
          recursos_necessarios: sanitizeText(fd.get('recursos_necessarios')) || sanitizeText(fd.get('requisitos_especificos')),
          solucao_orientacao: sanitizeText(fd.get('solucao_orientacao')),
          tecnico: sanitizeText(fd.get('tecnico')),
          data_relato: toDate(fd.get('data_relato')),
          previsao_conclusao: toDate(fd.get('previsao_conclusao')),
          prioridade: sanitizeText(fd.get('prioridade')),
        };
        try {
          const { error } = await supabase.from('pendencias').update(payload).eq('id', id);
          if (error) throw error;
          await supabase.from('pendencia_triagem').update({ tecnico_relato: payload.tecnico }).eq('pendencia_id', id);
          msg.textContent = 'Salvo com sucesso';
          apply();
          if (typeof m.closeModal === 'function') m.closeModal();
        } catch (err) {
          msg.textContent = 'Erro: ' + err.message;
        }
      });
    }
  });

  apply();
}