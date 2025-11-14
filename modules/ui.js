export function initAppShell(mount) {
  mount.innerHTML = `
    <div class="app-shell">
      <header class="header">
        <div class="brand"><div class="logo"></div>CS Pendências</div>
        <div class="user-actions">
          <span id="userName" style="opacity:0.85; font-size:12px; margin-right:8px"></span>
          <button class="btn" id="toggleSidebar">Menu</button>
          <button class="btn" id="themeToggle" aria-label="Tema" title="Tema">☀️</button>
          <button class="btn" id="logoutBtn">Sair</button>
        </div>
      </header>
      <aside class="sidebar" id="sidebar">
        <nav class="nav" id="nav">
          <a href="#/dashboard" data-route="#/dashboard">Dashboard</a>
          <a href="#/pendencias" data-route="#/pendencias">Pendências</a>
          <a href="#/modulos" data-route="#/modulos">Módulos</a>
          <a href="#/relatorios" data-route="#/relatorios">Relatórios</a>
          <a href="#/config" data-route="#/config">Configurações</a>
        </nav>
      </aside>
      <main class="content"><div id="view"></div></main>
    </div>
  `;

  import('../utils/session.js').then(({ session }) => {
    const s = session.get();
    const el = document.getElementById('userName');
    if (el) el.textContent = s?.nome || '';
  });

  import('../utils/theme.js').then(({ theme }) => {
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme.get() === 'light' ? '☀️' : '🌙';
  });

  document.getElementById('toggleSidebar').addEventListener('click', () => {
    const sb = document.getElementById('sidebar');
    const show = getComputedStyle(sb).display === 'none';
    sb.style.display = show ? 'block' : 'none';
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    const { session } = await import('../utils/session.js');
    session.clear();
    location.hash = '#/login';
  });

  document.getElementById('themeToggle').addEventListener('click', async () => {
    const { theme } = await import('../utils/theme.js');
    const next = theme.get() === 'light' ? 'dark' : 'light';
    theme.set(next);
    document.documentElement.setAttribute('data-theme', next);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = next === 'light' ? '☀️' : '🌙';
  });
}

export function setActiveNav(route) {
  document.querySelectorAll('#nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-route') === route);
  });
}

export function viewMount() {
  return document.getElementById('view');
}

export function openModal(innerHtml) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.5)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '1000';
  const modal = document.createElement('div');
  modal.className = 'card';
  modal.style.maxWidth = '900px';
  modal.style.width = '96%';
  modal.innerHTML = '<div class="toolbar" style="justify-content:flex-end"><button class="btn" id="closeModal">Fechar</button></div>' + innerHtml;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  modal.querySelector('#closeModal').addEventListener('click', () => overlay.remove());
  return modal;
}

// Diálogo de confirmação simples com estilo consistente
export function confirmDialog(message, { confirmText = 'Confirmar', cancelText = 'Cancelar' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '1000';
    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.maxWidth = '540px';
    modal.style.width = '96%';
    modal.innerHTML = `
      <div style="padding:12px;">
        <div class="title" style="margin-bottom:8px;">Confirmação</div>
        <div class="hint" style="margin-bottom:12px;">${message}</div>
        <div class="toolbar" style="justify-content:flex-end; gap:8px;">
          <button class="btn" id="cancelBtn">${cancelText}</button>
          <button class="btn primary" id="okBtn">${confirmText}</button>
        </div>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    const done = (result) => { try { document.body.removeChild(overlay); } catch {} resolve(result); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
    modal.querySelector('#cancelBtn').addEventListener('click', () => done(false));
    modal.querySelector('#okBtn').addEventListener('click', () => done(true));
  });
}