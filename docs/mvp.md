# Fluxi — Escopo do MVP

Regra: **no MVP entram as operações grandes, bem feitas.** Ajustes finos ficam na lista "Depois".

## Blocos do MVP (em ordem)

### 1. Fluxograma (prioridade máxima)
Tem que estar muito funcional, com boa navegação e usabilidade.
- Editor draw.io embutido, já com a biblioteca BPMN INC e as cores padrão.
- Abrir, editar, salvar (autosave) e exportar (PNG/SVG).
- Navegação fluida: zoom, mover, reorganizar layout, tela cheia.
- Gerar o fluxograma a partir da transcrição (IA → FluxoSchema → XML).
- Lista de fluxogramas por processo e área, com busca.

### 2. Captura e transcrição
- Gravar reunião (áudio) e enviar arquivo.
- Transcrição com AssemblyAI (falantes, português).

### 3. POP
- Extração do POP pela IA e geração do DOCX/PDF no modelo INC v3.
- Edição do conteúdo antes de gerar.

### 4. Base da plataforma
- Login (Supabase Auth), empresas (tenants), membros e papéis.
- Cadastro de áreas e cargos.
- Cadastro de processos (código `XXXX-XXXX`, identificação `COME-001`).

### 5. Publicação
- Publicar no Notion.

## Depois (ajustes finos, fora do MVP)
- Histórico de revisões com comparação e restauração.
- Ajuste do fluxograma por instrução à IA (chat).
- Rastreio de cada elemento até o trecho da transcrição/áudio e nível de confiança.
- Alertas de consistência do diagrama.
- Diff sync e edição simultânea.
- Regras de numeração de versões (`1.1` × `2.0`).
- Subprocessos.
- Gravação de tela, colar transcrição, agendar reunião, convidar participantes.
- Fluxo de aprovação (papel aprovador) com etapas.
- Pagamentos, planos e limites de uso.
- Páginas públicas (landing, preços, links públicos de POP).
