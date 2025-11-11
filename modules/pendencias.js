import { viewMount } from './ui.js';
import { getSupabase } from '../supabaseClient.js';
import { debounce } from '../utils/debounce.js';
import { sanitizeText, toDate } from '../utils/validation.js';
import { storage } from '../utils/storage.js';
import { session } from '../utils/session.js';

function rowHtml(p) {
  return `
    <tr data-id="${p.id}">
      <td><input type="checkbox" class="sel" /></td>
      <td><a href="#/pendencia?id=${p.id}" class="link">${p.id}</a></td>
      <td>${p.cliente_id ?? ''}</td>
      <td>${p.tipo}</td>
      <td>${p.tecnico}</td>
      <td>${p.prioridade}</td>
      <td><span class="status ${p.status}" aria-label="${p.status}">${p.status}</span></td>
      <td>${p.data_relato ?? ''}</td>
      <td>
        <button class="btn success" data-act="res">Resolvido</button>
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
  let q = supabase.from('pendencias').select('*').order('created_at', { ascending: false });
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.tipo) q = q.eq('tipo', filters.tipo);
  if (filters.cliente_id) q = q.eq('cliente_id', filters.cliente_id);
  if (filters.tecnico) q = q.ilike('tecnico', `%${filters.tecnico}%`);
  if (filters.data_ini) q = q.gte('data_relato', filters.data_ini);
  if (filters.data_fim) q = q.lte('data_relato', filters.data_fim);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await q.range(from, to).select('*', { count: 'exact' });
  return { data: data ?? [], error, count: count ?? 0 };
}

function formHtml(clientes) {
  const clienteOptions = clientes.map(c => `<option value="${c.id_cliente}">${c.nome}</option>`).join('');
  const user = session.get();
  return `
  <div class="card">
    <h3>Nova Pendência</h3>
    <form id="pForm" class="form">
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
          <label>Informações: Detalhes adicionais (prints, logs, etc.)</label>
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
          <label>Informações: Requisitos específicos</label>
          <textarea class="input" name="requisitos_especificos"></textarea>
        </div>
      </div>
      <div class="toolbar">
        <button class="btn primary" type="submit">Salvar</button>
      </div>
    </form>
    <div id="pFormMsg" class="hint"></div>
  </div>`;
}

function filtersHtml(clientes) {
  const clienteOptions = ['<option value="">Todos</option>', ...clientes.map(c => `<option value="${c.id_cliente}">${c.nome}</option>`)].join('');
  return `
  <div class="card">
    <div class="filters">
      <select id="fStatus" class="input">
        <option value="">Status</option>
        <option>Triagem</option>
        <option>Aguardando Aceite</option>
        <option>Rejeitada</option>
        <option>Em Andamento</option>
        <option>Aguardando Teste</option>
        <option>Resolvido</option>
      </select>
      <select id="fTipo" class="input">
        <option value="">Tipo</option>
        <option>Programação</option>
        <option>Suporte</option>
        <option>Implantação</option>
        <option>Atualizacao</option>
      </select>
      <select id="fCliente" class="input">${clienteOptions}</select>
      <input id="fTecnico" class="input" placeholder="Técnico" />
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
  <div class="card" id="virtWrap" style="max-height:420px; overflow:auto;">
    <table class="table" id="pTable">
      <thead><tr>
        <th><input type="checkbox" id="selAll" /></th>
        <th>ID</th><th>Cliente</th><th>Tipo</th><th>Técnico</th><th>Prioridade</th><th>Status</th><th>Data</th><th>Ações</th>
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
  v.innerHTML = `
    <div class="grid">
      <div class="col-12">${filtersHtml(clientes)}</div>
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

  ['fStatus','fTipo','fCliente','fTecnico','fDataIni','fDataFim'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', debounce(() => {
      const filters = {
        status: sanitizeText(document.getElementById('fStatus').value) || undefined,
        tipo: sanitizeText(document.getElementById('fTipo').value) || undefined,
        cliente_id: sanitizeText(document.getElementById('fCliente').value) || undefined,
        tecnico: sanitizeText(document.getElementById('fTecnico').value) || undefined,
        data_ini: toDate(document.getElementById('fDataIni').value) || undefined,
        data_fim: toDate(document.getElementById('fDataFim').value) || undefined,
      };
      state.filters = filters;
      state.page = 1;
      debouncedApply();
    }, 250));
  });

  document.getElementById('novoBtn').addEventListener('click', async () => {
    const { openModal } = await import('./ui.js');
    const m = openModal(formHtml(clientes));
    // Preencher opções de módulo com nomes
    const mods = await listModulos();
    const moduloSel = m.querySelector('#moduloSel');
    moduloSel.innerHTML = ['<option value="">Selecione...</option>', ...mods.map(m => `<option value="${m.id}">${m.nome}</option>`)].join('');
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
      await supabase.from('pendencias').delete().eq('id', id);
      apply();
    }
    if (act === 'res') {
      await supabase.from('pendencias').update({ status: 'Resolvido' }).eq('id', id);
      apply();
    }
  });

  apply();
}