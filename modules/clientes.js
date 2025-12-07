import { viewMount, openModal } from './ui.js';
import { getSupabase } from '../supabaseClient.js';
import { debounce } from '../utils/debounce.js';
import { sanitizeText, formatDateBr } from '../utils/validation.js';
import { storage } from '../utils/storage.js';

function gridHtml() {
  return `
  <div class="card">
    <div class="toolbar" style="justify-content:space-between; margin-bottom:8px">
      <div id="cliPageInfo" class="hint"></div>
      <div>
        <button class="btn" id="cliPrev">Anterior</button>
        <button class="btn" id="cliNext">Próxima</button>
      </div>
    </div>
    <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
      <input id="cliSearch" class="input" placeholder="Pesquisar cliente…" />
    </div>
    <div style="height:calc(100vh - 320px); overflow:auto;">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Nome</th>
            <th>Email</th>
            <th>Endereço</th>
            <th>Número</th>
            <th>Complemento</th>
            <th>CEP</th>
            <th>UF</th>
            <th>Cidade</th>
            <th>Contatos</th>
            <th>Telefone</th>
            <th>Celular</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody id="cliTbody"></tbody>
      </table>
    </div>
  </div>`;
}

async function fetchClientes(term, page, limit) {
  const supabase = getSupabase();
  let q = supabase
    .from('clientes')
    .select('id_cliente, nome, email, endereco, numero, complemento, cep, uf, cidade, contatos, telefone, celular', { count: 'exact' })
    .order('nome', { ascending: true });
  if (term) {
    const isNum = /^\d+$/.test(term);
    const pattern = `%${term}%`;
    const ors = [
      `nome.ilike.${pattern}`,
      `email.ilike.${pattern}`,
      `endereco.ilike.${pattern}`,
      `complemento.ilike.${pattern}`,
      `cep.ilike.${pattern}`,
      `uf.ilike.${pattern}`,
      `cidade.ilike.${pattern}`,
      `contatos.ilike.${pattern}`,
      `telefone.ilike.${pattern}`,
      `celular.ilike.${pattern}`
    ];
    if (isNum) {
      ors.push(`id_cliente.eq.${term}`);
      ors.push(`numero.eq.${term}`);
    }
    q = q.or(ors.join(','));
  }
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, count } = await q.range(from, to);
  return { data: data || [], count: count || 0 };
}

export async function render() {
  const v = viewMount();
  v.innerHTML = `<div class="grid"><div class="col-12">${gridHtml()}</div></div>`;
  const state = { term: '', page: 1, limit: 20, data: [], count: 0 };
  const saved = storage.get('clientes_filters', null);
  if (saved && typeof saved === 'object') {
    state.term = saved.term || '';
    state.page = 1;
  }
  const searchEl = document.getElementById('cliSearch');
  if (searchEl) searchEl.value = state.term;

  const apply = async () => {
    const { data, count } = await fetchClientes(state.term, state.page, state.limit);
    state.data = data;
    state.count = count;
    const tbody = document.getElementById('cliTbody');
    if (tbody) {
      tbody.innerHTML = state.data.map(c => `
        <tr data-id="${sanitizeText(String(c.id_cliente ?? ''))}">
          <td>${sanitizeText(String(c.id_cliente ?? ''))}</td>
          <td>${sanitizeText(c.nome ?? '')}</td>
          <td>${sanitizeText(c.email ?? '')}</td>
          <td>${sanitizeText(c.endereco ?? '')}</td>
          <td>${sanitizeText(String(c.numero ?? ''))}</td>
          <td>${sanitizeText(c.complemento ?? '')}</td>
          <td>${sanitizeText(c.cep ?? '')}</td>
          <td>${sanitizeText(c.uf ?? '')}</td>
          <td>${sanitizeText(c.cidade ?? '')}</td>
          <td>${sanitizeText(c.contatos ?? '')}</td>
          <td>${sanitizeText(c.telefone ?? '')}</td>
          <td>${sanitizeText(c.celular ?? '')}</td>
          <td><button class="btn info" data-act="chamados" data-id="${sanitizeText(String(c.id_cliente ?? ''))}">Chamados</button></td>
        </tr>
      `).join('');
    }
    const pageInfo = document.getElementById('cliPageInfo');
    if (pageInfo) pageInfo.textContent = `Página ${state.page} • ${state.count} clientes`;
  };

  const debouncedApply = debounce(apply, 250);
  if (searchEl) searchEl.addEventListener('input', () => {
    state.term = sanitizeText(searchEl.value);
    state.page = 1;
    storage.set('clientes_filters', { term: state.term, limit: state.limit }, 30 * 24 * 60 * 60 * 1000);
    debouncedApply();
  });
  const prevBtn = document.getElementById('cliPrev');
  const nextBtn = document.getElementById('cliNext');
  if (prevBtn) prevBtn.addEventListener('click', () => { state.page = Math.max(1, state.page - 1); apply(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { state.page += 1; apply(); });
  const tbody = document.getElementById('cliTbody');
  if (tbody) tbody.addEventListener('click', (e) => {
    const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
    if (act === 'chamados') {
      const id = e.target.getAttribute('data-id') || (e.target.closest('tr')?.getAttribute('data-id')) || '';
      if (id) openChamadosModal(id);
    }
  });
  apply();
}

export function openChamadosModal(clienteId) {
  const supabase = getSupabase();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toYmd = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  };
  let dIni = toYmd(start);
  let dFim = toYmd(end);
  let data = [];
  let count = 0;
  const m = openModal(`
    <div class="card" style="width:100%;">
      <h3>Chamados do Cliente ${sanitizeText(String(clienteId))}</h3>
      <div class="toolbar" style="gap:8px; align-items:center; flex-wrap:wrap;">
        <label>Período</label>
        <input id="chIni" class="input" type="date" value="${dIni}" />
        <input id="chFim" class="input" type="date" value="${dFim}" />
        <button class="btn success" id="chApply">Aplicar filtro</button>
        <button class="btn warning" id="chClear">Limpar</button>
        <div id="chInfo" class="hint" style="margin-left:auto"></div>
      </div>
      <div style="height:60vh; overflow:auto; margin-top:8px;">
        <table class="table">
          <thead>
            <tr>
              <th>Iniciado por</th>
              <th>Finalizado por</th>
              <th>Solicitado em</th>
              <th>Finalizado em</th>
              <th>Relato do Operador</th>
              <th>Tipo de Atendimento</th>
              <th>Tipo de Fechamento</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody id="chTbody"></tbody>
        </table>
      </div>
      <div class="toolbar" style="justify-content:flex-end; margin-top:8px;">
        <button class="btn" id="chClose">Fechar</button>
      </div>
    </div>
  `);
  const tbody = m.querySelector('#chTbody');
  const infoEl = m.querySelector('#chInfo');
  const iniEl = m.querySelector('#chIni');
  const fimEl = m.querySelector('#chFim');
  const applyBtn = m.querySelector('#chApply');
  const clearBtn = m.querySelector('#chClear');
  const closeBtn = m.querySelector('#chClose');
  const toIsoStart = (ymd) => new Date(`${ymd}T00:00:00`).toISOString();
  const toIsoEnd = (ymd) => new Date(`${ymd}T23:59:59.999`).toISOString();
  const renderRows = () => {
    if (tbody) {
      tbody.innerHTML = (data || []).map(r => `
        <tr>
          <td>${sanitizeText(r.iniciado_por ?? '')}</td>
          <td>${sanitizeText(r.finalizado_por ?? '')}</td>
          <td>${sanitizeText(r.solicitado_em ? formatDateBr(r.solicitado_em) : '')}</td>
          <td>${sanitizeText(r.finalizado_em ? formatDateBr(r.finalizado_em) : '')}</td>
          <td class="pre">${sanitizeText(r.relato_do_operador ?? '')}</td>
          <td>${sanitizeText(r.tipo_de_atendimento ?? '')}</td>
          <td>${sanitizeText(r.tipo_de_fechamento ?? '')}</td>
          <td class="pre">${sanitizeText(r.observacao ?? '')}</td>
        </tr>
      `).join('');
    }
    if (infoEl) infoEl.textContent = `${count} registros`;
  };
  const fetchChamados = async () => {
    const iniIso = toIsoStart(dIni);
    const fimIso = toIsoEnd(dFim);
    const { data: rows, count: cnt } = await supabase
      .from('clientes_atendimentos')
      .select('iniciado_por, finalizado_por, solicitado_em, finalizado_em, relato_do_operador, tipo_de_atendimento, tipo_de_fechamento, observacao', { count: 'exact' })
      .eq('id_cliente', clienteId)
      .gte('solicitado_em', iniIso)
      .lte('solicitado_em', fimIso)
      .order('solicitado_em', { ascending: false });
    data = rows || [];
    count = cnt || 0;
    renderRows();
  };
  if (applyBtn) applyBtn.addEventListener('click', () => { dIni = iniEl.value || dIni; dFim = fimEl.value || dFim; fetchChamados(); });
  if (clearBtn) clearBtn.addEventListener('click', () => { dIni = toYmd(start); dFim = toYmd(end); if (iniEl) iniEl.value = dIni; if (fimEl) fimEl.value = dFim; fetchChamados(); });
  if (closeBtn) closeBtn.addEventListener('click', () => { if (m.closeModal) m.closeModal(); });
  fetchChamados();
}
