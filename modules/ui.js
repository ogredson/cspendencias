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
          <a href="#/ajuda" data-route="#/ajuda">Ajuda</a>
        </nav>
      </aside>
      <main class="content"><div id="view"></div></main>
    </div>
  `;

  import('../utils/session.js').then(({ session }) => {
    const s = session.get();
    const el = document.getElementById('userName');
    if (el) el.textContent = s?.nome || '';
    const cfgLink = document.querySelector('#nav a[data-route="#/config"]');
    if (cfgLink) cfgLink.style.display = (s?.funcao === 'Adm') ? '' : 'none';
  });

  import('../utils/theme.js').then(({ theme }) => {
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme.get() === 'light' ? '☀️' : '🌙';
  });

  document.getElementById('toggleSidebar').addEventListener('click', () => {
    const shell = document.querySelector('.app-shell');
    if (!shell) return;
    shell.classList.toggle('sidebar-hidden');
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    const { session } = await import('../utils/session.js');
    session.clear();
    const el = document.getElementById('userName');
    if (el) el.textContent = '';
    const cfgLink = document.querySelector('#nav a[data-route="#/config"]');
    if (cfgLink) cfgLink.style.display = 'none';
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
  overlay.setAttribute('aria-hidden', 'false');

  const modal = document.createElement('div');
  modal.className = 'card';
  modal.style.maxWidth = '900px';
  modal.style.width = '96%';
  modal.style.maxHeight = '90vh';
  modal.style.overflow = 'auto';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = innerHtml;

  overlay.appendChild(modal);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);

  // Focus trap
  const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const getFocusable = () => Array.from(modal.querySelectorAll(focusableSelector)).filter(el => !el.disabled);
  const focusables = getFocusable();
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const previouslyFocused = document.activeElement;
  if (first) first.focus(); else modal.setAttribute('tabindex', '-1'), modal.focus();

  const keyHandler = (e) => {
    if (e.key === 'Escape') { close(); }
    if (e.key === 'Tab') {
      const f = getFocusable();
      if (!f.length) return;
      const firstEl = f[0];
      const lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    }
  };

  const close = () => {
    try { document.body.removeChild(overlay); } catch {}
    document.body.style.overflow = prevOverflow || '';
    document.removeEventListener('keydown', keyHandler);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
  };

  document.addEventListener('keydown', keyHandler);
  // Não fechar por clique no fundo; apenas pelo botão "Fechar" ou tecla Escape
  // Botão de fechar será controlado pelo chamador via m.querySelector('#closeModalBtn')

  // Expor método de fechamento no elemento do modal
  modal.closeModal = close;

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
