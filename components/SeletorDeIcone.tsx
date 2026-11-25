'use client';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icone } from '@/components/Icone';
import { DesenhoDoIcone } from '@/components/IconeDoProcesso';
import { buscarIcones, corPadrao, CORES_DO_PROCESSO, indexar, type CatalogoDeIcones, type IconeDoProcesso, type IndiceDeIcones, type ItemDoCatalogo } from '@/lib/icones';
import { definirIconeDoProcesso } from '@/lib/processos';

// Seletor do ícone do processo (decisão 133): todos os ícones do Lucide, com nome e busca em português, e 12 cores. O
// catálogo só é pedido ao servidor quando o seletor abre (uma vez por visita) e traz o desenho de cada ícone. Salvar
// manda só o nome do ícone e a cor: o servidor guarda o desenho do catálogo dele. Nada é sugerido nem aplicado sozinho
// (decisão 134).

type Dados = { catalogo: CatalogoDeIcones; indice: IndiceDeIcones };
let pedido: Promise<Dados> | null = null;
const pedirCatalogo = () => (pedido ??= fetch('/api/icones')
  .then(async (r) => { if (!r.ok) throw new Error('catálogo'); const catalogo = (await r.json()) as CatalogoDeIcones; return { catalogo, indice: indexar(catalogo) }; })
  .catch((e) => { pedido = null; throw e; }));

const PASSO = 120; // quantos ícones aparecem por vez na lista (o resto vem com "Mostrar mais")
const milhar = (n: number) => n.toLocaleString('pt-BR');

export function SeletorDeIcone({ processo, aoSalvar, aoFechar }: {
  processo: { id: string; nome: string; icone: IconeDoProcesso | null };
  aoSalvar: (icone: IconeDoProcesso | null) => void;
  aoFechar: () => void;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [nome, setNome] = useState<string | null>(processo.icone?.nome ?? null);
  const [cor, setCor] = useState<number | null>(processo.icone?.cor ?? null); // nula: a cor de sempre do processo
  const [termo, setTermo] = useState('');
  const [categoria, setCategoria] = useState<number | null>(null);
  const [limite, setLimite] = useState(PASSO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const busca = useRef<HTMLInputElement>(null);

  const carregar = () => { setFalhou(false); pedirCatalogo().then(setDados).catch(() => setFalhou(true)); };
  useEffect(() => { carregar(); busca.current?.focus(); }, []);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !salvando) aoFechar(); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aoFechar, salvando]);

  const resultados = useMemo(() => (dados ? buscarIcones(dados.indice, termo, categoria) : []), [dados, termo, categoria]);
  const porNome = useMemo(() => new Map((dados?.catalogo.icones ?? []).map((i) => [i[0], i])), [dados]);
  // O desenho da prévia: o do catálogo ou, antes de ele chegar, o que o processo já tem.
  const escolhido = nome ? porNome.get(nome) ?? null : null;
  const nosDaPrevia = escolhido?.[4] ?? (nome && processo.icone?.nome === nome ? processo.icone.nos : null);
  const c = CORES_DO_PROCESSO[cor ?? corPadrao(processo.id)];

  const mudou = nome !== (processo.icone?.nome ?? null) || (!!nome && cor !== (processo.icone?.cor ?? null));
  async function salvar() {
    setSalvando(true); setErro('');
    try {
      const r = await definirIconeDoProcesso(processo.id, nome, nome ? cor : null);
      aoSalvar(r.icone);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o ícone.');
      setSalvando(false);
    }
  }

  const item = (i: ItemDoCatalogo) => (
    <button key={i[0]} type="button" className="ico-item" aria-pressed={nome === i[0]} title={`${i[1]} (${i[0]})`} onClick={() => setNome(i[0])}>
      <DesenhoDoIcone nos={i[4]} tamanho={22} />
      <span>{i[1]}</span>
    </button>
  );

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="ico-titulo" onClick={() => !salvando && aoFechar()}>
      <div className="dialog dialog-lg ico-dialogo" onClick={(e) => e.stopPropagation()}>
        <div className="dialogo-topo">
          <span className={`ico-previa${nosDaPrevia ? '' : ' sem'}`} style={{ background: c.fundo, color: c.tinta, '--miolo': c.miolo } as CSSProperties} aria-hidden="true">
            {nosDaPrevia && <DesenhoDoIcone nos={nosDaPrevia} tamanho={26} />}
          </span>
          <div className="dialogo-topo-texto">
            <h2 id="ico-titulo">Ícone do processo</h2>
            <p className="notice">{processo.nome}{escolhido ? ` · ${escolhido[1]}` : ''}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon dialog-fechar" onClick={aoFechar} disabled={salvando} title="Fechar" aria-label="Fechar"><Icone nome="fechar" tamanho={18} /></button>
        </div>

        <section className="ico-busca">
          <label className="campo-busca">
            <Icone nome="busca" tamanho={18} />
            <input ref={busca} type="search" value={termo} onChange={(e) => { setTermo(e.target.value); setLimite(PASSO); }} placeholder="Buscar: saúde, obra, férias…" aria-label="Buscar ícone" />
          </label>
          {dados && (
            <div className="ico-chips" role="group" aria-label="Categorias">
              <button type="button" className="ico-chip" aria-pressed={categoria === null} onClick={() => { setCategoria(null); setLimite(PASSO); }}>Todos</button>
              {dados.catalogo.categorias.map((n, i) => (
                <button key={n} type="button" className="ico-chip" aria-pressed={categoria === i} onClick={() => { setCategoria(i); setLimite(PASSO); }}>{n}</button>
              ))}
            </div>
          )}
          {!dados && !falhou && <p className="ico-vazio" role="status">Carregando os ícones…</p>}
          {falhou && <p className="ico-vazio" role="alert">Não foi possível carregar os ícones. <button type="button" className="link-sec" onClick={carregar}>Tentar de novo</button></p>}
          {dados && (resultados.length === 0
            ? <p className="ico-vazio">Nenhum ícone com “{termo.trim()}”{categoria !== null ? ' nesta categoria' : ''}. Tente outra palavra.</p>
            : (
              <div className="ico-grade rolavel ico-todos" role="group" aria-label="Ícones">
                {resultados.slice(0, limite).map(item)}
                {resultados.length > limite && (
                  <button type="button" className="ico-mais" onClick={() => setLimite(limite + PASSO)}>Mostrar mais ({milhar(resultados.length - limite)} {resultados.length - limite === 1 ? 'restante' : 'restantes'})</button>
                )}
              </div>
            ))}
        </section>

        <section aria-label="Cor">
          <p className="ico-titulo-secao">Cor</p>
          <div className="ico-cores" role="group" aria-label="Cor do ícone">
            {CORES_DO_PROCESSO.map((x, i) => (
              <button key={x.nome} type="button" className="ico-cor" style={{ background: x.fundo }} aria-pressed={(cor ?? corPadrao(processo.id)) === i} title={x.nome} aria-label={x.nome} onClick={() => setCor(i)}>
                <span style={{ background: x.tinta }} />
              </button>
            ))}
          </div>
        </section>

        {erro && <p className="form-erro" role="alert">{erro}</p>}
        <div className="ico-rodape">
          <p className="ico-credito">
            {dados ? (termo.trim() || categoria !== null ? `${milhar(resultados.length)} de ${milhar(dados.catalogo.icones.length)} ícones` : `${milhar(dados.catalogo.icones.length)} ícones`) : 'Ícones'} do Lucide (licença ISC)
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setNome(null)} disabled={salvando || !nome} title="Volta ao quadradinho colorido">Sem ícone</button>
            <button type="button" className="btn" onClick={aoFechar} disabled={salvando}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando || !mudou}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
