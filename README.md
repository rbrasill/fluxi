# fluxi
aplicação para mapeamento de processos end-to-end (de ponta a ponta)

## Rodar localmente
```bash
npm install
npm run dev   # http://localhost:3000
```
- `npm run biblioteca`: regenera `public/drawio/biblioteca-inc.json` a partir de `templates/drawio/biblioteca-estilos.xml`.
- Banco: aplique `supabase/migrations/0001_fluxogramas.sql` no Supabase (SQL Editor) e configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` e `ASSEMBLYAI_API_KEY` (ver `.env.example`).
