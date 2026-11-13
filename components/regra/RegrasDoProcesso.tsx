'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { avisar, confirmar } from '@/components/Dialogos';
import { Icone } from '@/components/Icone';
import { ehGestor, podeIniciarSemConvite, useEu } from '@/lib/auth/eu';
import { ROTULO_STATUS, TIPOS_REGRA, rotuloDoTipo, type StatusEntrevista, type TipoRegra } from '@/lib/entrevista/topicos';
import { iniciarEntrevistaAgora } from '@/lib/entrevistas';
import { corDoAvatar, iniciais } from '@/lib/iniciais';
import { listarConvidaveis, type PessoaConvidavel } from '@/lib/pessoas';
import { agirNaRegra, audioDaRegra, criarRegra, editarRegra, escolherConfirmador, listarRegras, type AcaoDaRegra, type DadosDaRegra, type Regra, type RegrasDoProcesso as Dados } from '@/lib/regras';

// A aba "Regras de negócio" do processo (decisão 89). A Maia sugere as regras a partir das entrevistas de regras
// de negócio, cada uma com o trecho da fala de onde saiu (dá para ouvir). Nada entra no processo sem confirmação:
// quem confirma é a pessoa escolhida para o processo (pode ser a própria pessoa entrevistada) e os administradores.
// A regra confirmada ganha código (RN-01, RC-01). Quando a regra pode conflitar com outra já confirmada, a Maia
// avisa, e dá para mandar a dúvida para a próxima entrevista.

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Tente de novo em instantes.');
const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const duracao = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);
const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
type Filtro = 'todas' | TipoRegra;
const ICONE_DO_TIPO: Record<TipoRegra, string> = { negocio: 'maleta', comportamento: 'pessoa', definicao: 'livro' };
const ROTULO_FILTRO: Record<TipoRegra, string> = { negocio: 'Negócio', comportamento: 'Comportamento', definicao: 'Definição' };

export function RegrasDoProcesso({ processoId, arquivado, visivel, aoCarregar, aoConvidar }: {
  processoId: string; arquivado: boolean;
  visivel: boolean; // a aba está na frente: recarrega ao voltar para ela
  aoCarregar?: (r: { disponivel: boolean; confirmadas: number; sugeridas: number }) => void;
  aoConvidar: () => void; // abre o convite para a entrevista de regras
}) {
  const eu = useEu();
  const router = useRouter();
  const gestor = ehGestor(eu);
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [ocupada, setOcupada] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [editando, setEditando] = useState<Regra | 'nova' | null>(null);
  const [menu, setMenu] = useState('');
  const [tocando, setTocando] = useState('');
  const [pessoas, setPessoas] = useState<PessoaConvidavel[] | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [ajuda, setAjuda] = useState(false); // a explicação dos tipos de regra (decisão 91)
  const audio = useRef<HTMLAudioElement | null>(null);

  const carregar = () => listarRegras(processoId).then((r) => { setD(r); setErro(''); }).catch((e) => setErro(msg(e)));
  useEffect(() => { if (visivel || d === null) void carregar(); }, [processoId, visivel]); // eslint-disable-line react-hooks/exhaustive-deps
  const sugeridas = (d?.regras ?? []).filter((r) => r.situacao === 'sugerida');
  const confirmadas = (d?.regras ?? []).filter((r) => r.situacao === 'confirmada');
  useEffect(() => { if (d) aoCarregar?.({ disponivel: d.disponivel, confirmadas: confirmadas.length, sugeridas: sugeridas.length }); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { audio.current?.pause(); }, []);

  if (erro && !d) return <p className="notice">Não foi possível carregar as regras ({erro}).</p>;
  if (!d) return <p className="notice">Carregando…</p>;
  if (!d.disponivel) return <p className="notice">As regras de negócio ainda não estão ligadas neste ambiente.</p>;

  const pode = d.pode_confirmar;
  const conflitos = sugeridas.filter((r) => r.conflito).length;
  const visiveis = confirmadas.filter((r) => filtro === 'todas' || r.tipo === filtro);
  const quemConfirma = d.confirmador?.nome ?? 'um administrador';

  async function agir(r: Regra, acao: AcaoDaRegra) {
    if (acao === 'descartar' && !(await confirmar({ titulo: 'Descartar esta sugestão?', mensagem: `“${r.texto}” sai da lista e a Maia não sugere de novo.`, acao: 'Descartar' }))) return;
    if (acao === 'arquivar' && !(await confirmar({ titulo: `Arquivar a regra ${r.codigo}?`, mensagem: 'A regra deixa de valer no processo. O código dela não é reaproveitado.', acao: 'Arquivar' }))) return;
    setOcupada(r.id);
    try { await agirNaRegra(r.id, acao); await carregar(); } catch (e) { void avisar('Não foi possível concluir.', msg(e)); } finally { setOcupada(''); }
  }

  /** Ouve o trecho: a gravação da conversa, a partir da fala de onde a regra saiu. */
  async function ouvir(r: Regra) {
    const a = audio.current;
    if (!a) return;
    if (tocando === r.id) { a.pause(); setTocando(''); return; }
    a.pause();
    setTocando(r.id);
    try {
      const { url, segundos } = await audioDaRegra(r.id);
      // Vai para o ponto da fala assim que a gravação informa o que tem (antes disso, o navegador não deixa buscar).
      // Insiste até o áudio estar de fato no ponto: conforme o navegador, a primeira tentativa não pega.
      let noPonto = segundos <= 0;
      const posicionar = () => {
        if (noPonto) return;
        try { a.currentTime = segundos; noPonto = a.currentTime >= segundos - 0.25; } catch { /* sem busca: toca do começo */ }
      };
      a.onloadedmetadata = a.oncanplay = posicionar;
      a.onended = a.onpause = () => setTocando((t) => (t === r.id ? '' : t));
      a.src = url;
      await a.play();
      posicionar();
    } catch (e) { setTocando(''); void avisar('Não foi possível tocar o trecho.', msg(e)); }
  }

  async function abrirEscolha() {
    setEscolhendo(true);
    if (!pessoas) listarConvidaveis().then(setPessoas).catch(() => setPessoas([]));
  }
  async function escolher(id: string) {
    try { await escolherConfirmador(processoId, id || null); setEscolhendo(false); await carregar(); } catch (e) { void avisar('Não foi possível escolher quem confirma.', msg(e)); }
  }
  async function iniciarAgora() {
    setIniciando(true);
    try { const r = await iniciarEntrevistaAgora(processoId, 'regras'); router.push(`/app/entrevistas/${r.id}`); } catch (e) { setIniciando(false); void avisar('Não foi possível iniciar a entrevista.', msg(e)); }
  }

  const chipTipo = (tipo: TipoRegra) => (
    <span className={`chip-regra chip-${tipo}`}><Icone nome={ICONE_DO_TIPO[tipo]} tamanho={13} />{rotuloDoTipo(tipo)}</span>
  );

  return (
    <div className="proc-grade regras-grade">
      <audio ref={audio} preload="none" hidden />
      <div className="proc-coluna">
        <div className="regras-contadores">
          <div className="cartao regra-contador"><span><i className="ponto ponto-teal" />Sugeridas pela Maia</span><strong>{sugeridas.length}</strong></div>
          <div className="cartao regra-contador"><span><i className="ponto ponto-pessego" />Possíveis conflitos</span><strong>{conflitos}</strong></div>
          <div className="cartao regra-contador"><span><i className="ponto ponto-verde" />Confirmadas</span><strong>{confirmadas.length}</strong></div>
        </div>

        {sugeridas.length > 0 && (
          <section className="regras-revisar" aria-labelledby="titulo-revisar">
            <div className="sec-titulo">
              <div className="sec-cabeca">
                <h3 id="titulo-revisar">Para revisar</h3>
                <p>A Maia encontrou estas regras nas conversas. Nada entra no processo sem {pode ? 'a sua confirmação' : `a confirmação de ${quemConfirma}`}.</p>
              </div>
              <BotaoAjudaTipos aoAbrir={() => setAjuda(true)} />
            </div>
            {sugeridas.map((r) => (
              <article key={r.id} className={`cartao regra-sugerida${r.conflito ? ' com-conflito' : ''}`} data-regra={r.id}>
                <div className="regra-chips"><span className="chip-regra chip-maia"><Icone nome="ia" tamanho={13} />Sugerida pela Maia</span>{chipTipo(r.tipo)}</div>
                <p className="regra-texto">{r.texto}</p>
                {r.trecho && (
                  <div className="regra-trecho">
                    {r.trecho_ms !== null && (
                      <button type="button" className="regra-play" onClick={() => void ouvir(r)} aria-label={tocando === r.id ? 'Parar o trecho' : 'Ouvir o trecho'} title={tocando === r.id ? 'Parar' : 'Ouvir o trecho da conversa'}>
                        <Icone nome={tocando === r.id ? 'pausa' : 'play'} tamanho={16} />
                      </button>
                    )}
                    <div>
                      <q>{r.trecho}</q>
                      {r.entrevista && <Link href={`/app/entrevistas/${r.entrevista.id}`}>Entrevista com {r.entrevista.entrevistado ?? 'pessoa entrevistada'}{r.trecho_ms !== null ? ` · ${mmss(r.trecho_ms)}` : ''}</Link>}
                    </div>
                  </div>
                )}
                {r.conflito && (
                  <div className="regra-conflito" role="note">
                    <Icone nome="alerta" tamanho={18} />
                    <div><strong>Possível conflito{r.conflito.codigo ? ` com ${r.conflito.codigo}` : ''}</strong><p>{r.conflito.texto}</p></div>
                  </div>
                )}
                {r.esclarecimento && (
                  <div className="regra-esclarecimento" role="note">
                    <Icone nome="conversa" tamanho={18} />
                    <div><strong>Resposta{r.esclarecimento.de ? ` de ${r.esclarecimento.de}` : ''} na entrevista seguinte</strong><p>{r.esclarecimento.texto}</p></div>
                  </div>
                )}
                <div className="regra-rodape">
                  <span className="regra-aplica"><Icone nome="pop" tamanho={15} />Aplica-se a: <b>{r.pop?.rotulo ?? 'Processo inteiro'}</b></span>
                  {pode && (
                    <div className="regra-acoes">
                      <button type="button" className="btn btn-ghost" disabled={ocupada === r.id} onClick={() => void agir(r, 'descartar')}>Descartar</button>
                      {(r.conflito || r.perguntar) && (
                        <button type="button" className={`btn btn-ia${r.perguntar ? ' marcado' : ''}`} disabled={ocupada === r.id} aria-pressed={r.perguntar} onClick={() => void agir(r, r.perguntar ? 'nao_perguntar' : 'perguntar')}
                          title={r.perguntar ? 'A Maia vai perguntar na próxima entrevista de regras deste processo. Clique para desmarcar' : 'A Maia esclarece esta dúvida na próxima entrevista de regras deste processo'}>
                          <Icone nome={r.perguntar ? 'check' : 'microfone'} tamanho={16} />{r.perguntar ? 'Vai para a próxima entrevista' : 'Perguntar na próxima entrevista'}
                        </button>
                      )}
                      <button type="button" className="btn" disabled={ocupada === r.id} onClick={() => setEditando(r)}>Editar</button>
                      <button type="button" className="btn btn-primary" disabled={ocupada === r.id} onClick={() => void agir(r, 'confirmar')}><Icone nome="check" tamanho={16} />Confirmar regra</button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}

        <section className="cartao lista-pops-cartao regras-confirmadas" aria-labelledby="titulo-regras">
          <div className="lista-pops-topo">
            <h2 id="titulo-regras" className="titulo-com-conta">Regras do processo<small>{plural(confirmadas.length, 'confirmada', 'confirmadas')}</small></h2>
            <div className="regras-topo-acoes">
              {confirmadas.length > 0 && (
                <div className="segmented filtro-pops" role="tablist" aria-label="Filtrar regras">
                  <button type="button" role="tab" aria-selected={filtro === 'todas'} onClick={() => setFiltro('todas')}>Todas<span className="conta-aba">{confirmadas.length}</span></button>
                  {TIPOS_REGRA.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={filtro === t.id} onClick={() => setFiltro(t.id)}>{ROTULO_FILTRO[t.id]}<span className="conta-aba">{confirmadas.filter((r) => r.tipo === t.id).length}</span></button>
                  ))}
                </div>
              )}
              {pode && <button type="button" className="btn" onClick={() => setEditando('nova')}><Icone nome="mais" tamanho={16} />Nova regra</button>}
            </div>
          </div>
          {confirmadas.length === 0 && (
            <p className="notice regras-vazio">{sugeridas.length
              ? 'Nenhuma regra confirmada ainda. Revise as sugestões da Maia acima.'
              : 'Nenhuma regra ainda. Convide quem conhece o processo para uma entrevista de regras de negócio: a Maia sugere as regras e você confirma.'}</p>
          )}
          {confirmadas.length > 0 && visiveis.length === 0 && <p className="notice regras-vazio">Nenhuma regra deste tipo.</p>}
          {visiveis.length > 0 && (
            <ul className="pops-linhas regras-linhas">
              {visiveis.map((r) => (
                <li key={r.id} className="pop-linha regra-linha" data-regra={r.id}>
                  <span className={`regra-codigo codigo-${r.tipo}`}>{r.codigo}</span>
                  <div className="regra-linha-texto">
                    <p>{r.texto}</p>
                    <span className="regra-meta">
                      <span>{rotuloDoTipo(r.tipo)}</span>
                      {r.pop && <span>{r.pop.rotulo}</span>}
                      {r.origem === 'maia'
                        ? <span>Maia{r.entrevista ? <> · <Link href={`/app/entrevistas/${r.entrevista.id}`}>entrevista com {r.entrevista.entrevistado ?? 'pessoa entrevistada'}</Link></> : null}</span>
                        : <span>Adicionada por {r.criado_por ?? 'alguém da equipe'}</span>}
                      <span className="regra-confirmada"><Icone nome="check" tamanho={14} />{r.origem === 'maia' && r.confirmada_por ? `Confirmada por ${r.confirmada_por}` : 'Confirmada'}</span>
                    </span>
                  </div>
                  {pode && (
                    <div className="menu">
                      <button type="button" className="btn btn-ghost btn-icon" aria-label={`Mais ações da regra ${r.codigo}`} title="Mais ações" aria-haspopup="true" aria-expanded={menu === r.id}
                        onClick={() => setMenu((m) => (m === r.id ? '' : r.id))} onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setMenu(''); }}><Icone nome="mais-acoes" /></button>
                      {menu === r.id && (
                        <div className="menu-list" role="menu">
                          <button type="button" role="menuitem" onClick={() => { setMenu(''); setEditando(r); }}>Editar</button>
                          <button type="button" role="menuitem" className="menu-perigo" onClick={() => { setMenu(''); void agir(r, 'arquivar'); }} onBlur={() => setMenu('')}><Icone nome="arquivar" tamanho={16} />Arquivar regra</button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="proc-coluna">
        <section className="cartao cartao-lateral" aria-labelledby="titulo-quem-confirma">
          <div className="lateral-topo">
            <span className="lateral-icone icone-verde"><Icone nome="check" tamanho={20} /></span>
            <h3 id="titulo-quem-confirma">Quem confirma as regras</h3>
          </div>
          {d.confirmador
            ? <div className="quem-pessoa"><span className={`avatar avatar-${corDoAvatar(d.confirmador.nome)}`} aria-hidden="true">{iniciais(d.confirmador.nome)}</span><strong>{d.confirmador.nome}</strong></div>
            : <p className="lateral-texto">Ninguém foi escolhido ainda: por enquanto, só administradores confirmam.</p>}
          {d.confirmador && <p className="lateral-texto">Revisa as sugestões da Maia e decide o que vale no processo. Administradores também confirmam.</p>}
          {gestor && !arquivado && !escolhendo && <button type="button" className="btn btn-largo" onClick={() => void abrirEscolha()}><Icone nome="pessoa" tamanho={16} />{d.confirmador ? 'Trocar pessoa' : 'Escolher pessoa'}</button>}
          {escolhendo && (
            <label className="field">
              <span>Pessoa que confirma</span>
              <select defaultValue={d.confirmador?.id ?? ''} disabled={pessoas === null} onChange={(e) => void escolher(e.target.value)} aria-label="Pessoa que confirma as regras">
                <option value="">{pessoas === null ? 'Carregando…' : 'Ninguém (só administradores)'}</option>
                {(pessoas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
          )}
        </section>

        <section className="cartao cartao-lateral" aria-labelledby="titulo-como-maia">
          <div className="lateral-topo">
            <span className="lateral-icone icone-maia"><Icone nome="microfone" tamanho={20} /></span>
            <h3 id="titulo-como-maia">Como a Maia encontra regras</h3>
          </div>
          <ol className="dicas-numeradas dicas-maia">
            <li>Conversa com quem conhece o processo, numa entrevista só sobre as regras: o que pode, o que não pode e em que condições.</li>
            <li>Identifica condições, limites, prazos, obrigações e proibições, e como as pessoas devem agir.</li>
            <li>Sugere cada regra com o trecho exato de onde saiu, e avisa quando duas falas não batem.</li>
          </ol>
          {gestor && !arquivado && <button type="button" className="btn btn-maia btn-largo" onClick={aoConvidar}><Icone nome="mais" tamanho={16} />Convidar para entrevista de regras</button>}
          {gestor && !arquivado && podeIniciarSemConvite(eu) && (
            <button type="button" className="btn btn-largo" disabled={iniciando} onClick={() => void iniciarAgora()} title="Você mesmo conversa com a Maia sobre as regras deste processo, agora, sem convite nem e-mail">
              <Icone nome="microfone" tamanho={16} />{iniciando ? 'Abrindo…' : 'Iniciar entrevista agora'}
            </button>
          )}
        </section>

        <section className="cartao cartao-lateral" aria-labelledby="titulo-tipos-regra">
          <div className="sec-titulo">
            <h3 id="titulo-tipos-regra">Tipos de regra</h3>
            <BotaoAjudaTipos aoAbrir={() => setAjuda(true)} />
          </div>
          <ul className="tipos-regra">
            {TIPOS_REGRA.map((t) => (
              <li key={t.id}>
                <span className={`lateral-icone icone-tipo-${t.id}`}><Icone nome={ICONE_DO_TIPO[t.id]} tamanho={18} /></span>
                <div><strong>{t.rotulo} · {t.sigla}</strong><p>{t.o_que}</p></div>
              </li>
            ))}
          </ul>
        </section>

        <section className="cartao cartao-lateral" aria-labelledby="titulo-fontes">
          <h3 id="titulo-fontes">Fontes analisadas</h3>
          {d.fontes.length === 0 && <p className="lateral-texto">Nenhuma entrevista de regras de negócio neste processo ainda.</p>}
          {d.fontes.length > 0 && (
            <ul className="fontes-regras">
              {d.fontes.map((f) => (
                <li key={f.id}>
                  <span className="lateral-icone icone-maia"><Icone nome="microfone" tamanho={18} /></span>
                  <div>
                    <Link href={`/app/entrevistas/${f.id}`}>Entrevista com {f.entrevistado ?? 'pessoa convidada'}</Link>
                    <span>{f.status === 'concluida'
                      ? `${data(f.quando)}${f.duracao_s ? ` · ${duracao(f.duracao_s)}` : ''} · ${plural(f.sugestoes, 'sugestão', 'sugestões')}`
                      : f.status === 'convidada' ? 'Convite enviado · ainda não começou' : f.status === 'em_andamento' ? 'Conversa em aberto' : ROTULO_STATUS[f.status as StatusEntrevista]}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      {editando && (
        <DialogoRegra regra={editando === 'nova' ? null : editando} pops={d.pops} aoFechar={() => setEditando(null)} aoPedirAjuda={() => setAjuda(true)}
          aoSalvar={async (dados) => {
            if (editando === 'nova') await criarRegra(processoId, dados); else await editarRegra(editando.id, dados);
            setEditando(null);
            await carregar();
          }} />
      )}
      {ajuda && <AjudaTipos aoFechar={() => setAjuda(false)} />}
    </div>
  );
}

/** O botão de ajuda (decisões 91 e 92): só o ícone de informação, discreto, que abre a explicação dos tipos de regra. */
function BotaoAjudaTipos({ aoAbrir }: { aoAbrir: () => void }) {
  return (
    <button type="button" className="btn-ajuda" onClick={aoAbrir} aria-label="Qual é a diferença entre os tipos de regra?" title="Qual é a diferença entre os tipos de regra?">
      <Icone nome="info" tamanho={18} />
    </button>
  );
}

/** A explicação dos tipos de regra, para quem não sabe a diferença: um texto simples para cada tipo, sem exemplos. */
function AjudaTipos({ aoFechar }: { aoFechar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar]);
  return createPortal(
    <div className="overlay sobre-dialogo" role="dialog" aria-modal="true" aria-labelledby="ajuda-tipos-titulo" onClick={aoFechar}>
      <div className="dialog dialog-lg dialogo-ajuda" onClick={(e) => e.stopPropagation()}>
        <div className="dialogo-topo">
          <span className="lateral-icone icone-ajuda"><Icone nome="info" tamanho={22} /></span>
          <div className="dialogo-topo-texto">
            <h2 id="ajuda-tipos-titulo">Regra de negócio, de comportamento ou definição?</h2>
            <p className="notice">Toda regra do processo é de um destes três tipos. Veja o que é cada um.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon dialog-fechar" onClick={aoFechar} title="Fechar" aria-label="Fechar" autoFocus><Icone nome="fechar" tamanho={18} /></button>
        </div>
        <ul className="ajuda-tipos">
          {TIPOS_REGRA.map((t) => (
            <li key={t.id} className={`ajuda-tipo ajuda-${t.id}`}>
              <div className="ajuda-tipo-topo">
                <span className={`lateral-icone icone-tipo-${t.id}`}><Icone nome={ICONE_DO_TIPO[t.id]} tamanho={18} /></span>
                <strong>{t.rotulo}</strong><span className={`regra-codigo codigo-${t.id}`}>{t.sigla}</span>
              </div>
              <p className="ajuda-explicacao">{t.explicacao}</p>
            </li>
          ))}
        </ul>
        <div className="ajuda-nao-e">
          <strong>Na dúvida</strong>
          <p>Se fala de uma exigência da empresa, é regra de negócio. Se fala da atitude da pessoa, é regra de comportamento. Se só explica uma palavra, é definição.</p>
          <strong>O que não é regra</strong>
          <p>O passo a passo do trabalho (o que se faz e em que ordem) não é regra: ele fica no fluxograma e no POP. Uma dica ou sugestão também não é regra, a não ser que seja obrigatória.</p>
        </div>
        <div className="dialog-actions"><button type="button" className="btn btn-primary" onClick={aoFechar}>Entendi</button></div>
      </div>
    </div>,
    document.body,
  );
}

/** Escrever uma regra nova (já nasce confirmada) ou editar uma regra: o texto, o tipo e a que se aplica. */
function DialogoRegra({ regra, pops, aoSalvar, aoFechar, aoPedirAjuda }: { regra: Regra | null; pops: { id: string; rotulo: string }[]; aoSalvar: (d: DadosDaRegra) => Promise<void>; aoFechar: () => void; aoPedirAjuda: () => void }) {
  const [texto, setTexto] = useState(regra?.texto ?? '');
  const [tipo, setTipo] = useState<TipoRegra>(regra?.tipo ?? 'negocio');
  const [pop, setPop] = useState(regra?.pop?.id ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try { await aoSalvar({ texto: texto.trim(), tipo, pop_id: pop || null }); } catch (err) { setErro(msg(err)); setSalvando(false); }
  }
  return createPortal(
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="regra-titulo" onClick={() => !salvando && aoFechar()}>
      <form className="dialog dialogo-regra" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h2 id="regra-titulo">{regra ? (regra.codigo ? `Editar a regra ${regra.codigo}` : 'Editar a sugestão') : 'Nova regra'}</h2>
        {!regra && <p className="notice">A regra escrita aqui já entra confirmada no processo.</p>}
        <label className="field">
          <span>Regra</span>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={600} required minLength={3} autoFocus placeholder={TIPOS_REGRA.find((t) => t.id === tipo)!.modelo} />
        </label>
        <fieldset className="opcoes-acesso">
          <legend className="legenda-com-ajuda">Tipo<BotaoAjudaTipos aoAbrir={aoPedirAjuda} /></legend>
          {TIPOS_REGRA.map((t) => (
            <label key={t.id} className={`opcao-acesso${tipo === t.id ? ' marcada' : ''}`}>
              <input type="radio" name="tipo-regra" value={t.id} checked={tipo === t.id} onChange={() => setTipo(t.id)} />
              <span><strong>{t.rotulo}</strong><small>{t.o_que}</small></span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>Aplica-se a</span>
          <select value={pop} onChange={(e) => setPop(e.target.value)}>
            <option value="">Processo inteiro</option>
            {pops.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
          </select>
        </label>
        {erro && <p className="form-erro" role="alert">{erro}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={aoFechar} disabled={salvando}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={salvando || texto.trim().length < 3}>{salvando ? 'Salvando…' : regra ? 'Salvar' : 'Adicionar regra'}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
