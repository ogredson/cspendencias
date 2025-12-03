import { viewMount } from './ui.js';
import { getSupabase } from '../supabaseClient.js';
import { session } from '../utils/session.js';

export function renderAuth() {
  const v = viewMount();
  v.innerHTML = `
    <div class="login card">
      <div class="title">Entrar</div>
      <div class="hint">Autenticação via usuários (email e senha).</div>
      <form class="form" id="loginForm">
        <div class="field">
          <label>Email</label>
          <input class="input" type="email" name="email" required placeholder="email@empresa.com" />
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
    const email = String(form.get('email')).trim();
    const senha = String(form.get('senha')).trim();
    const supabase = getSupabase();
    const msg = document.getElementById('loginMsg');
    msg.textContent = 'Autenticando...';
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, email, funcao, ativo')
        .eq('email', email)
        .eq('senha', senha)
        .eq('ativo', true)
        .maybeSingle();
      if (error) throw error;
      if (!data) { msg.textContent = 'Email ou senha inválidos, ou usuário inativo.'; return; }
      session.set({ usuario_id: data.id, nome: data.nome, email: data.email, funcao: data.funcao });
      const userEl = document.getElementById('userName');
      if (userEl) userEl.textContent = data.nome || '';
      const cfgLink = document.querySelector('#nav a[data-route="#/config"]');
      if (cfgLink) cfgLink.style.display = (data.funcao === 'Adm') ? '' : 'none';
      location.hash = '#/dashboard';
    } catch (err) {
      msg.textContent = 'Erro: ' + err.message;
    }
  });
}
