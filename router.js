import { renderAuth } from './modules/auth.js';
import { setActiveNav } from './modules/ui.js';
import { session } from './utils/session.js';

const routes = {
  '#/dashboard': async () => (await import('./modules/dashboard.js')).render(),
  '#/pendencias': async () => (await import('./modules/pendencias.js')).render(),
  '#/modulos': async () => (await import('./modules/modulos.js')).render(),
  '#/relatorios': async () => (await import('./modules/relatorios.js')).render(),
  '#/config': async () => (await import('./modules/config.js')).render(),
};

function currentRoute() {
  return location.hash || '#/dashboard';
}

async function resolveRoute() {
  const s = session.get();
  if (!s && currentRoute() !== '#/login') {
    return renderAuth();
  }
  const route = routes[currentRoute()] || routes['#/dashboard'];
  setActiveNav(currentRoute());
  return route();
}

export function initRouter() {
  window.addEventListener('hashchange', resolveRoute);
  resolveRoute();
}