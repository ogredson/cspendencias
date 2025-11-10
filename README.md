# CS Pendências Frontend

- Coloque suas credenciais do Supabase em `config.js`.
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