import { viewMount } from './ui.js';
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
      <select id="cliPageSize" class="input">
        <option value="20">20</option>
        <option value="50">50</option>
        <option value="100">100</option>
      </select>
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
    state.limit = saved.limit || 20;
    state.page = 1;
  }
  const searchEl = document.getElementById('cliSearch');
  const sizeEl = document.getElementById('cliPageSize');
  if (searchEl) searchEl.value = state.term;
  if (sizeEl) sizeEl.value = String(state.limit);

  const apply = async () => {
    const { data, count } = await fetchClientes(state.term, state.page, state.limit);
    state.data = data;
    state.count = count;
    const tbody = document.getElementById('cliTbody');
    if (tbody) {
      tbody.innerHTML = state.data.map(c => `
        <tr>
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
  if (sizeEl) sizeEl.addEventListener('change', () => {
    state.limit = parseInt(sizeEl.value, 10) || 20;
    state.page = 1;
    storage.set('clientes_filters', { term: state.term, limit: state.limit }, 30 * 24 * 60 * 60 * 1000);
    debouncedApply();
  });
  const prevBtn = document.getElementById('cliPrev');
  const nextBtn = document.getElementById('cliNext');
  if (prevBtn) prevBtn.addEventListener('click', () => { state.page = Math.max(1, state.page - 1); apply(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { state.page += 1; apply(); });
  apply();
}

