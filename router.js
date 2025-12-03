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
      <div class="hint" style="margin-bottom:8px;">Guia atualizado com fluxos, permissões e filtros.</div>
      <details open>
        <summary>🏠 Visão geral</summary>
        <div style="padding:8px 0;">
          <ul>
            <li>Barra superior: mostra o nome do usuário, tema (claro/escuro) e sair.</li>
            <li>Menu: <b>Dashboard</b>, <b>Pendências</b>, <b>Relatórios</b>, <b>Ajuda</b>.</li>
            <li><b>Módulos</b> e <b>Configurações</b> ficam visíveis apenas para usuários <b>Adm</b>.</li>
          </ul>
        </div>
      </details>
      <details>
        <summary>🔄 Fluxo da pendência</summary>
        <div style="padding:8px 0;">
          <ul>
            <li><b>Triagem</b>: Aguardando designação.</li>
            <li><b>Aguardando Aceite</b>: aguardando confirmação do técnico designado.</li>
            <li><b>Em Analise</b>: entendimento do problema e definição de plano.</li>
            <li><b>Em Andamento</b>: execução do plano.</li>
            <li><b>Em Teste</b>: validação das mudanças.</li>
            <li><b>Aguardando o Cliente</b>: aguardando retorno do cliente.</li>
            <li><b>Rejeitada</b>: a demanda não segue; <b>motivo</b> é exibido no grid.</li>
            <li><b>Resolvido</b>: concluída e validada.</li>
          </ul>
        </div>
      </details>
      <details>
        <summary>🧑‍💻 Botões e permissões</summary>
        <div style="padding:8px 0;">
          <ul>
            <li><b>Gestores</b> (Adm, Supervisor, Gerente): acesso total aos botões.</li>
            <li>Quando <b>Aguardando Aceite</b>:
              “Aceitar Análise”, “Aceitar Resolução” e “Rejeitar” habilitam apenas para o técnico de triagem aguardando aceite.
            </li>
            <li>“Resolver” habilita para o técnico aguardando aceite ou para o <b>responsável</b>.</li>
            <li>“Excluir” é restrito a gestores; demais usuários veem o botão desabilitado.</li>
            <li>Botões desabilitados usam estilo padrão visual (opacidade reduzida e cursor <i>not-allowed</i>).</li>
          </ul>
        </div>
      </details>
      <details>
        <summary>🧩 Ações da janela de detalhes</summary>
        <div style="padding:8px 0;">
          <ul>
            <li><b>Designar Técnico</b>: define o técnico de triagem e muda o status para “Aguardando Aceite”.</li>
            <li><b>Resolver</b>: abre modal para informar <b>Solução/Orientação</b> e confirma antes de salvar.</li>
            <li><b>Rejeitar</b>: abre modal para informar <b>Motivo da Rejeição</b> e confirma antes de salvar.</li>
            <li><b>Aguardar Cliente</b> e <b>Enviar para Testes</b>: não alteram o responsável; a confirmação cita o técnico aguardando aceite ou o usuário logado.</li>
            <li><b>Notificar Técnico</b>: envia resumo por WhatsApp quando configurado.</li>
          </ul>
        </div>
      </details>
      <details>
        <summary>🔍 Filtros e pesquisa</summary>
        <div style="padding:8px 0;">
          <ul>
            <li>Filtros aplicados são <b>persistidos</b> e mantidos entre telas; use <b>Limpar</b> para voltar ao padrão (Últimos 7 dias).</li>
            <li>Filtro de <b>Técnico</b> possui seletor de posição: <b>Qualquer</b>, <b>Relato</b>, <b>Triagem</b>, <b>Responsável</b>.</li>
            <li>Visualização <b>Grid/Kanban</b> alternável e também persistida.</li>
            <li>Pesquisa por cliente: digite o nome; se não houver ID, faz busca por nome aproximado.</li>
          </ul>
        </div>
      </details>
      <details>
        <summary>🧾 Campos da pendência</summary>
        <div style="padding:8px 0;">
          <ul>
            <li><b>Cliente</b>, <b>Módulo/Release</b>, <b>Tipo</b>, <b>Prioridade</b>, <b>Técnico do Relato</b>.</li>
            <li><b>Datas</b>: relato e previsão de conclusão.</li>
            <li><b>Descrição</b> e <b>Solução/Orientação</b>.</li>
            <li>Informações adicionais (Situação, Etapas, Frequência) para tipos Programação/Suporte.</li>
            <li><b>Link do Trello</b> quando vinculado.</li>
          </ul>
        </div>
      </details>
      <details>
        <summary>📌 Trello</summary>
        <div style="padding:8px 0;">
          <ul>
            <li>Use <b>Gerar Card Trello</b>, escolha Área de trabalho, Board e Lista, revise título e descrição e confirme.</li>
            <li>O link do card é salvo na pendência; use <b>Ver Card Trello</b> para abrir.</li>
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
