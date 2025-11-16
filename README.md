# CS Pendências Frontend

- Segredos não devem ser versionados. Use `config.local.js` (ignorado pelo Git).
  - Exemplo:
    ```
    window.__CONFIG__ = {
      SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
      SUPABASE_ANON_KEY: "SEU-ANON-KEY",
      TRELLO_KEY: "SEU-TRELLO-KEY",
      TRELLO_TOKEN: "SEU-TRELLO-TOKEN"
    };
    ```
- Abra `index.html` via servidor local para evitar problemas de CORS.

## Páginas
- `#/dashboard`: métricas e últimas pendências.
- `#/pendencias`: CRUD, filtros, resolução em lote.
- `#/modulos`: gerenciamento de módulos.
- `#/relatorios`: gráficos por status, prioridade e técnico.
- `#/config`: exportação CSV e informações de configuração.

## Tecnologias
- JavaScript (ES Modules, async/await)
- Supabase JS via CDN
- Chart.js via CDN
- CSS responsivo (mobile-first)

## Segurança e UX
- Validação básica de inputs e sanitização.
- Debounce em buscas e cache com TTL em `localStorage`.
- Paginação em listas; pronto para escalar com virtual scrolling.

## Deploy na Vercel
- Defina variáveis de ambiente no projeto Vercel:
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (a anon key é pública por design)
  - Opcional: `TRELLO_KEY`, `TRELLO_TOKEN` (evite expor em produção; prefira proxy/serveless)
- Configure o Build Command: `node build.mjs`
- Output Directory: `.` (raiz do projeto)
- O script `build.mjs` gera `config.local.js` com base nas variáveis de ambiente.
- Após o deploy, a página `#/config` exibirá o status das chaves carregadas.

## Estados de Pendência (Permitidos)

Estes valores devem ser usados exatamente como definidos na base (CHECK `pendencias_status_check`):

- Triagem
- Aguardando Aceite
- Rejeitada
- Em Analise
- Em Andamento
- Em Teste
- Resolvido

### Convenções
- Use exatamente `Em Analise` (sem acento) para passar na constraint.
- Mensagens de UI podem exibir acentos (“Em análise”), mas o valor gravado no banco deve seguir o padrão acima.
- As classes de estilo de status devem espelhar os valores exatos para manter cores coerentes (ex.: `class="status Em Analise"`).

### Fluxo Padrão (Exemplo)
1. Triagem
   - Criada a pendência com status `Triagem`.
   - Registro em `pendencia_triagem` com `tecnico_relato`.
2. Designação
   - `Designar para triagem` define `tecnico_triagem` e muda para `Aguardando Aceite`.
3. Aceitar Análise
   - Botão “Aceitar Análise”: define `tecnico_responsavel`, grava `data_aceite`, muda para `Em Analise` e registra histórico “Pendência aceita para análise”.
4. Aceitar Resolução
   - Botão “Aceitar Resolução”: define `tecnico_responsavel`, grava `data_aceite`, muda para `Em Andamento` e registra histórico “Pendência aceita para resolução”.
5. Teste
   - Opcionalmente alterar para `Em Teste` quando a solução entra em validação de usuário/QA.
6. Conclusão
   - “Resolvido” na listagem atualiza para `Resolvido` e registra histórico “Pendência resolvida”.
   - “Rejeitar” atualiza para `Rejeitada`, grava motivo e registra histórico “Pendência rejeitada”.

### Dicas de Implementação (Front-End)
- Valide status sempre contra este conjunto permitido antes de gravar.
- Ao mudar status, registre histórico com:
  - `acao` descritiva (ex.: “Pendência aceita para análise”).
  - `usuario` responsável (usuário logado ou técnico de triagem selecionado).
  - `campo_alterado`, `valor_anterior`, `valor_novo`.
- Exiba na UI “quem” e “quando” em cada etapa com base em `pendencia_triagem` e `pendencia_historicos`.