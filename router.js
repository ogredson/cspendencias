import { renderAuth } from './modules/auth.js';
import { setActiveNav, openModal } from './modules/ui.js';
import { session } from './utils/session.js';

const routes = {
  '#/dashboard': async () => (await import('./modules/dashboard.js')).render(),
  '#/pendencias': async () => (await import('./modules/pendencias.js')).render(),
  '#/modulos': async () => renderModulosProtected(),
  '#/relatorios': async () => (await import('./modules/relatorios.js')).render(),
  '#/config': async () => renderConfigProtected(),
  '#/pendencia': async () => (await import('./modules/pendencia_detalhes.js')).render(),
  '#/ajuda': async () => renderHelp(),
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

function renderHelp() {
  const m = openModal(`
    <div style="padding:12px;">
      <h3>Ajuda</h3>
      <div class="hint" style="margin-bottom:8px;">Guia rápido em linguagem simples.</div>
      <details open>
        <summary>🆕 Criar pendência</summary>
        <div style="padding:8px 0;">
          <ul>
            <li>Acesse <b>Pendências</b> e clique em <b>Novo</b>.</li>
            <li>Preencha <b>Cliente</b>, <b>Módulo</b>, <b>Tipo</b>, <b>Prioridade</b> e <b>Técnico do Relato</b>.</li>
            <li>Informe <b>Data do relato</b>, <b>Título</b> e a <b>Descrição</b>.</li>
            <li>Opcional: informe o <b>Link do Trello</b> se já existir.</li>
            <li>Salve. O <b>Status</b> começa em <b>Triagem</b>.</li>
          </ul>
        </div>
      </details>
      <details>
        <summary>✏️ Editar pendência</summary>
        <div style="padding:8px 0;">
          <ul>
            <li>Na tabela, clique em <b>Editar</b> na linha desejada.</li>
            <li>Altere os campos necessários e clique em <b>Salvar</b>.</li>
            <li>Use as abas para acessar <b>Dados</b> e <b>Solução/Orientação</b>.</li>
          </ul>
        </div>
      </details>
      <details>
        <summary>🔄 Fluxo da pendência</summary>
        <div style="padding:8px 0;">
          <ul>
            <li><b>Triagem</b>: pendência criada e aguardando análise inicial.</li>
            <li><b>Aguardando Aceite</b>: aguardando confirmação do responsável.</li>
            <li><b>Em Analise</b>: entendimento do problema e definição do plano.</li>
            <li><b>Em Andamento</b>: execução do que foi planejado.</li>
            <li><b>Em Teste</b>: validação das mudanças.</li>
            <li><b>Aguardando o Cliente</b>: esperando retorno do cliente.</li>
            <li><b>Rejeitada</b>: a demanda não segue (com justificativa).</li>
            <li><b>Resolvido</b>: concluída e validada.</li>
          </ul>
        </div>
      </details>
      <details>
        <summary>🧾 Campos da pendência</summary>
        <div style="padding:8px 0;">
          <ul>
            <li><b>Cliente</b>: quem solicitou.</li>
            <li><b>Módulo</b>: área do sistema relacionada.</li>
            <li><b>Tipo</b>: natureza (Programação, Suporte, etc.).</li>
            <li><b>Prioridade</b>: urgência (Crítica, Alta, Média, Baixa).</li>
            <li><b>Técnico do Relato</b>: quem descreveu o problema.</li>
            <li><b>Data do relato</b>: quando foi registrado.</li>
            <li><b>Previsão conclusão</b>: quando espera finalizar.</li>
            <li><b>Título</b> e <b>Descrição</b>: resumo e detalhes.</li>
            <li><b>Situação</b>, <b>Etapas</b>, <b>Frequência</b>, <b>Informações</b>: ajudam o diagnóstico.</li>
            <li><b>Solução/Orientação</b>: o que foi feito ou recomendado.</li>
            <li><b>Link do Trello</b>: endereço do card vinculado.</li>
          </ul>
        </div>
      </details>
      <details>
        <summary>📌 Trello: criar e vincular cards</summary>
        <div style="padding:8px 0;">
          <ul>
            <li>Na tela da pendência, use <b>Gerar Card Trello</b>.</li>
            <li>Escolha <b>Área de trabalho</b>, <b>Board</b> e <b>Lista</b>.</li>
            <li>Revise <b>Título</b> e <b>Descrição</b> do card.</li>
            <li>Clique em <b>Criar Card</b>. O link fica salvo na pendência.</li>
            <li>Para abrir, use <b>Ver Card Trello</b> quando houver link.</li>
          </ul>
        </div>
      </details>
      <div class="toolbar" style="justify-content:flex-end; margin-top:12px;">
        <button class="btn" id="helpClose">Fechar</button>
      </div>
    </div>
  `);
  const btn = m.querySelector('#helpClose');
  if (btn && m.closeModal) btn.addEventListener('click', () => m.closeModal());
}

async function renderConfigProtected() {
  const { session } = await import('./utils/session.js');
  const s = session.get();
  if (s?.funcao === 'Adm') {
    return (await import('./modules/config.js')).render();
  }
  const v = document.getElementById('view');
  if (v) {
    v.innerHTML = `
      <div class="card">
        <h3>Acesso restrito</h3>
        <div class="hint">Somente o usuário Adm pode ver Configurações.</div>
      </div>
    `;
  }
}
async function renderModulosProtected() {
  const s = session.get();
  if (s?.funcao === 'Adm') {
    return (await import('./modules/modulos.js')).render();
  }
  const v = document.getElementById('view');
  if (v) {
    v.innerHTML = `
      <div class="card">
        <h3>Acesso restrito</h3>
        <div class="hint">Somente o usuário Adm pode ver Módulos.</div>
      </div>
    `;
  }
}
