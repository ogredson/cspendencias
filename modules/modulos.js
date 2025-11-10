import { viewMount } from './ui.js';
import { getSupabase } from '../supabaseClient.js';

export async function render() {
  const v = viewMount();
  v.innerHTML = `
    <div class="grid">
      <div class="col-6 card">
        <h3>Módulos</h3>
        <table class="table" id="mTable">
          <thead><tr><th>ID</th><th>Nome</th><th>Ações</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="col-6 card">
        <h3>Novo módulo</h3>
        <form id="mForm" class="form">
          <div class="field"><label>Nome</label><input class="input" name="nome" required /></div>
          <div class="toolbar"><button class="btn primary" type="submit">Salvar</button></div>
        </form>
        <div id="mMsg" class="hint"></div>
      </div>
    </div>
  `;

  const supabase = getSupabase();

  async function load() {
    const { data } = await supabase.from('modulos').select('id, nome').order('id');
    const tbody = document.querySelector('#mTable tbody');
    tbody.innerHTML = (data || []).map(m => `
      <tr data-id="${m.id}">
        <td>${m.id}</td>
        <td>${m.nome}</td>
        <td><button class="btn danger" data-act="del">Excluir</button></td>
      </tr>
    `).join('');
  }

  document.getElementById('mForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('mMsg');
    msg.textContent = 'Salvando...';
    const nome = new FormData(e.target).get('nome');
    const { error } = await supabase.from('modulos').insert({ nome: String(nome).trim() });
    if (error) msg.textContent = 'Erro: ' + error.message; else { msg.textContent = 'Salvo'; e.target.reset(); }
    load();
  });

  document.getElementById('mTable').addEventListener('click', async (e) => {
    const act = e.target.getAttribute('data-act');
    if (act === 'del') {
      const id = e.target.closest('tr').getAttribute('data-id');
      await supabase.from('modulos').delete().eq('id', id);
      load();
    }
  });

  load();
}