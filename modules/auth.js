import { viewMount } from './ui.js';
import { getSupabase } from '../supabaseClient.js';
import { session } from '../utils/session.js';

export function renderAuth() {
  const v = viewMount();
  v.innerHTML = `
    <div class="login card">
      <div class="title">Entrar</div>
      <div class="hint">Autenticação via clientes (nome e senha).</div>
      <form class="form" id="loginForm">
        <div class="field">
          <label>Nome</label>
          <input class="input" type="text" name="nome" required placeholder="Nome do cliente" />
        </div>
        <div class="field">
          <label>Senha</label>
          <input class="input" type="password" name="senha" required />
        </div>
        <div class="toolbar">
          <button class="btn primary" type="submit">Entrar</button>
        </div>
      </form>
      <div id="loginMsg" class="hint"></div>
    </div>
  `;

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const nome = String(form.get('nome')).trim();
    const senha = String(form.get('senha')).trim();
    const supabase = getSupabase();
    const msg = document.getElementById('loginMsg');
    msg.textContent = 'Autenticando...';
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id_cliente, nome, senha')
        .eq('nome', nome)
        .eq('senha', senha)
        .maybeSingle();
      if (error) throw error;
      if (!data) { msg.textContent = 'Nome ou senha inválidos.'; return; }
      session.set({ cliente_id: data.id_cliente, nome: data.nome });
      location.hash = '#/dashboard';
    } catch (err) {
      msg.textContent = 'Erro: ' + err.message;
    }
  });
}