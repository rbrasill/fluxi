-- Decisão 141: gestão de arquivos no POP. Cada POP pode ter arquivos anexados (documentos, imagens, vídeos e outros
-- formatos), com descrição e validade. O arquivo em si fica no Storage (bucket `gravacoes`, pasta do POP); esta tabela
-- guarda o cadastro. A ligação com as etapas fica no conteúdo do POP (`conteudo.procedimentos[].arquivos`, com os ids
-- daqui): um arquivo pode estar em várias etapas, ou em nenhuma (referência geral do POP).
create table if not exists public.pop_arquivos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pop_id uuid not null references public.pops(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 200),
  descricao text not null default '' check (char_length(descricao) <= 300),
  caminho text not null unique,
  tipo text not null default '',
  tamanho bigint not null default 0 check (tamanho >= 0),
  -- Último dia em que o arquivo pode ser usado. Nulo: sem validade definida. Depois dessa data o arquivo continua
  -- guardado, mas fica "Expirado" e ninguém o abre até a validade ser alterada.
  validade date,
  -- Com quantos dias de antecedência o arquivo passa a "Próximo do vencimento".
  avisar_dias integer not null default 30 check (avisar_dias between 0 and 365),
  criado_por text not null default '',
  criado_por_id uuid references public.pessoas(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pop_arquivos_do_pop on public.pop_arquivos (pop_id, criado_em);
-- Só o servidor lê e grava (chave de serviço), como nas outras tabelas.
alter table public.pop_arquivos enable row level security;
