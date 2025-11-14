import { renderAuth } from './modules/auth.js';
import { setActiveNav } from './modules/ui.js';
import { session } from './utils/session.js';

const routes = {
  '#/dashboard': async () => (await import('./modules/dashboard.js')).render(),
  '#/pendencias': async () => (await import('./modules/pendencias.js')).render(),
  '#/modulos': async () => (await import('./modules/modulos.js')).render(),
  '#/relatorios': async () => (await import('./modules/relatorios.js')).render(),
  '#/config': async () => (await import('./modules/config.js')).render(),
  '#/pendencia': async () => (await import('./modules/pendencia_detalhes.js')).render(),
};

function currentRoute() {
  const h = location.hash || '#/dashboard';
  return h.split('?')[0];
}

async function resolveRoute() {
  const base = currentRoute();
  const s = session.get();

  // Tratar login explicitamente
  if (base === '#/login') {
    if (s) {
      // Já logado: enviar para dashboard
      location.hash = '#/dashboard';
      return;
    }
    // Não logado: renderizar tela de login
    return renderAuth();
  }

  // Qualquer rota sem sessão: ir para login
  if (!s) {
    location.hash = '#/login';
    return renderAuth();
  }

  const route = routes[base] || routes['#/dashboard'];
  setActiveNav(base);
  return route();
}

export function initRouter() {
  window.addEventListener('hashchange', resolveRoute);
  resolveRoute();
}