import { initAppShell } from './modules/ui.js';
import { initRouter } from './router.js';
import { supabaseReady } from './supabaseClient.js';
import { theme } from './utils/theme.js';

const mount = document.getElementById('app');

function renderConfigNotice() {
  mount.innerHTML = `
    <div class="login card">
      <div class="title">Configuração necessária</div>
      <div class="notice">
        Defina <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> em <code>config.js</code>.
      </div>
    </div>
  `;
}

async function bootstrap() {
  if (!supabaseReady()) {
    renderConfigNotice();
    return;
  }

  // Apply persisted theme on startup
  document.documentElement.setAttribute('data-theme', theme.get());

  initAppShell(mount);
  initRouter();
}

bootstrap();