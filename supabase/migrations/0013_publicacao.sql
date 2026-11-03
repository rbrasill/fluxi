-- Decisão 32: publicação online do POP e do fluxograma do processo.

-- Link público: código longo e aleatório (não dá para adivinhar). Cada linha existente ganha o seu.
alter table public.pops add column if not exists link_publico text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists pops_link_publico on public.pops (link_publico);
alter table public.fluxogramas add column if not exists link_publico text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists fluxogramas_link_publico on public.fluxogramas (link_publico);

-- Versão publicada do POP: cópia do conteúdo no momento em que foi publicado (os prints são
-- copiados para tenants/<conta>/publicacoes/<pop>/). A página pública mostra só ela.
alter table public.pops add column if not exists publicacao jsonb;
alter table public.pops add column if not exists publicado_em timestamptz;

-- SVG do fluxograma, exportado pelo editor (draw.io) a cada salvamento: é o que a página pública mostra.
alter table public.fluxogramas add column if not exists svg text;
alter table public.fluxogramas add column if not exists tem_svg boolean generated always as (svg is not null) stored;
