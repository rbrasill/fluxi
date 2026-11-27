'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { MelhorarComIa } from '@/components/pop/MelhorarComIa';
import { corDoAvatar, iniciais, sigla } from '@/lib/iniciais';
import { obterPerfil, perfilCompleto, salvarPerfil, type AlteracaoDoPerfil, type Perfil } from '@/lib/perfil';
import { ROTULO_NIVEL, type Nivel } from '@/lib/pessoas';

// Meu perfil (decisão 84): o que a própria pessoa conta sobre si (cargo, área, gestor direto e o que faz), o acesso
// dela e os processos em que participa. Salva sozinho. A Maia usa a área, o cargo e as atividades nas entrevistas.

const O_QUE_FAZ: Record<Nivel, string> = {
  comum: 'usa o INCFlow e conversa com a Maia quando é convidado',
  gestor: 'também convida pessoas para conversas com a Maia',
  admin: 'cadastra pessoas e muda acessos',
};
const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** O texto das atividades é simples (sem formatação); a revisão da IA trabalha com HTML: vai e volta por aqui. */
const paraHtml = (t: string) => t.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => `<p>${escapar(l)}</p>`).join('');
function paraTexto(html: string) {
  const el = document.createElement('div');
  el.innerHTML = html.replace(/<\/(p|li|tr)>/g, '\n').replace(/<br\s*\/?>/g, '\n');
  return (el.textContent ?? '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

export default function PerfilPage() {
  const [p, setP] = useState<Perfil | null | undefined>(undefined);
  const [erro, setErro] = useState('');
  const [estado, setEstado] = useState<'' | 'salvando' | 'salvo' | 'erro'>('');
  const [msgErro, setMsgErro] = useState('');
  const salvo = useRef<Perfil | null>(null); // o que já está no servidor
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    obterPerfil().then((d) => { salvo.current = d; setP(d); }).catch((e) => { setErro(e instanceof Error ? e.message : 'Não foi possível abrir o perfil.'); setP(null); });
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  if (p === undefined) return <div className="page"><p className="notice">Carregando…</p></div>;
  if (p === null) return <div className="page"><div className="empty"><h2>Perfil indisponível</h2><p>{erro}</p><Link href="/app/inicio" className="btn btn-primary">Voltar ao início</Link></div></div>;

  /** Manda para o servidor só o que mudou. Nome vazio não é salvo: volta ao que estava. */
  async function salvar(campos: (keyof AlteracaoDoPerfil)[], atual: Perfil = p!) {
    const base = salvo.current!;
    const mudou: AlteracaoDoPerfil = {};
    for (const c of campos) {
      const v = typeof atual[c] === 'string' ? (atual[c] as string).trim() : atual[c];
      if (c === 'nome' && (v as string).length < 2) { setP((x) => x && { ...x, nome: base.nome }); continue; }
      if (v !== base[c]) (mudou as Record<string, unknown>)[c] = v;
    }
    if (!Object.keys(mudou).length) return;
    setEstado('salvando');
    try {
      await salvarPerfil(mudou);
      salvo.current = { ...salvo.current!, ...mudou } as Perfil;
      setEstado('salvo');
    } catch (e) {
      setMsgErro(e instanceof Error ? e.message : 'Tente de novo em instantes.');
      setEstado('erro');
    }
  }

  const mudar = (d: Partial<Perfil>) => setP((x) => x && { ...x, ...d });
  function mudarAtividades(v: string) {
    const novo = { ...p!, atividades: v };
    setP(novo);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void salvar(['atividades'], novo), 1200);
  }

  const area = p.areas.find((a) => a.id === p.area_id) ?? null;
  const organizacao = area?.organizacao ?? p.organizacao;
  const completo = perfilCompleto(p);
  const resumo = [p.cargo.trim(), area?.nome].filter(Boolean).join(' · ');
  const orgs = [...new Set(p.areas.map((a) => a.organizacao ?? ''))];
  const bloqueado = !p.disponivel;

  return (
    <div className="page pagina-perfil">
      <nav className="trilha" aria-label="Caminho"><span>Conta</span><Icone nome="avancar" tamanho={14} /><span aria-current="page">Meu perfil</span></nav>

      <section className="cartao perfil-topo">
        <span className="perfil-avatar" aria-hidden="true">{iniciais(p.nome)}</span>
        <div className="perfil-quem">
          <h1>{p.nome}</h1>
          <p>{resumo || 'Adicione seu cargo e sua área'}</p>
          <p className="perfil-chips"><span className="chip-tipo">{ROTULO_NIVEL[p.nivel]}</span><span>{p.email}</span></p>
        </div>
        <div className="perfil-progresso" role="group" aria-label={`Perfil ${completo}% completo`}>
          <div><span>Perfil completo</span><strong>{completo}%</strong></div>
          <span className="barra-progresso"><span style={{ width: `${completo}%` }} /></span>
          {estado === 'salvando' && <small role="status">Salvando…</small>}
          {estado === 'salvo' && <small className="ok" role="status"><Icone nome="check" tamanho={14} />Salvo automaticamente</small>}
          {estado === 'erro' && <small className="erro" role="alert">Não foi possível salvar. {msgErro}</small>}
        </div>
      </section>

      {bloqueado && <div className="aviso" role="status">O perfil ainda não pode ser salvo: falta aplicar a migração 0023 (perfil) no banco.</div>}

      <div className="proc-grade perfil-grade">
        <div className="proc-coluna">
          <section className="cartao" aria-labelledby="titulo-sobre">
            <div className="sec-cabeca">
              <h2 id="titulo-sobre">Sobre você</h2>
              <p>Aparece para as pessoas da organização e ajuda a Maia a saber com quem está falando.</p>
            </div>
            <div className="perfil-campos">
              <label className="field">Nome completo
                <input value={p.nome} onChange={(e) => mudar({ nome: e.target.value })} onBlur={() => void salvar(['nome'])} maxLength={120} disabled={bloqueado} />
              </label>
              <label className="field">Cargo
                <input value={p.cargo} onChange={(e) => mudar({ cargo: e.target.value })} onBlur={() => void salvar(['cargo'])} maxLength={120} placeholder="Ex.: Analista de processos" disabled={bloqueado} />
              </label>
              <label className="field">Área
                <select value={p.area_id ?? ''} disabled={bloqueado} onChange={(e) => { const novo = { ...p, area_id: e.target.value || null }; setP(novo); void salvar(['area_id'], novo); }}>
                  <option value="">Selecione sua área</option>
                  {orgs.length > 1
                    ? orgs.map((o) => <optgroup key={o} label={o || 'Sem organização'}>{p.areas.filter((a) => (a.organizacao ?? '') === o).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</optgroup>)
                    : p.areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </label>
              <label className="field"><span>Gestor(a) direto(a) <span className="opcional">· opcional</span></span>
                <input value={p.gestor} onChange={(e) => mudar({ gestor: e.target.value })} onBlur={() => void salvar(['gestor'])} maxLength={120} placeholder="Nome de quem você reporta" disabled={bloqueado} />
              </label>
            </div>
          </section>

          <section className="cartao" aria-labelledby="titulo-atividades">
            <div className="sec-titulo">
              <div className="sec-cabeca">
                <h2 id="titulo-atividades">O que você faz</h2>
                <p>Suas principais atividades, com suas palavras.</p>
              </div>
              {!bloqueado && (
                <MelhorarComIa variante="botao" rotulo="O que você faz" vazio={!p.atividades.trim()}
                  pedido={() => ({ campo: 'atividades', texto: paraHtml(p.atividades), area: area?.nome })}
                  aoAplicar={(html) => { const novo = { ...p, atividades: paraTexto(html).slice(0, 2000) }; setP(novo); void salvar(['atividades'], novo); }} />
              )}
            </div>
            <textarea className="perfil-atividades" rows={6} maxLength={2000} value={p.atividades} disabled={bloqueado} aria-labelledby="titulo-atividades"
              onChange={(e) => mudarAtividades(e.target.value)} onBlur={() => { if (timer.current) clearTimeout(timer.current); void salvar(['atividades']); }}
              placeholder="Ex.: Mapeio os processos das áreas, desenho fluxogramas e reviso os POPs antes de publicar." />
            <p className="nota-maia"><span className="nota-maia-icone"><Icone nome="microfone" tamanho={16} /></span>A Maia usa sua área, seu cargo e suas atividades para não perguntar de novo quem você é e para fazer perguntas mais certeiras nas entrevistas.</p>
          </section>

          <section className="cartao lista-pops-cartao" aria-labelledby="titulo-participa">
            <div className="lista-pops-topo perfil-processos-topo">
              <div>
                <h2 id="titulo-participa">Processos em que você participa</h2>
                <p>Os processos sobre os quais você conversou com a Maia.</p>
              </div>
              <span className="sec-conta">{p.processos.length} {p.processos.length === 1 ? 'processo' : 'processos'}</span>
            </div>
            {p.processos.length === 0
              ? <p className="lista-pops-vazia">Você ainda não participou de nenhum processo. Quando conversar com a Maia sobre um processo, ele aparece aqui.</p>
              : (
                <ul className="pops-linhas perfil-processos">
                  {p.processos.map((x) => (
                    <li key={x.processo_id}>
                      <Link href={`/app/processos/${x.processo_id}`} className="pop-linha">
                        <span className={`avatar avatar-quadrado avatar-${corDoAvatar(x.area ?? x.nome)}`} aria-hidden="true">{sigla(x.area ?? x.nome)}</span>
                        <span className="pop-linha-info">
                          <strong>{x.nome}</strong>
                          <span className="pop-linha-meta">{x.area && <span>{x.area}</span>}<span>entrevista em {data(x.quando)}</span></span>
                        </span>
                        <span className="chip-papel papel-entrevistado">Entrevistado</span>
                        <Icone nome="avancar" tamanho={16} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            <p className="lista-pops-rodape perfil-legenda"><b>Entrevistado</b> conversou com a Maia sobre o processo</p>
          </section>
        </div>

        <aside className="proc-coluna">
          <section className="cartao cartao-lateral" aria-labelledby="titulo-acesso">
            <h3 id="titulo-acesso">Acesso</h3>
            <dl className="perfil-acesso">
              <div><dt>Tipo de acesso</dt><dd>{ROTULO_NIVEL[p.nivel]} · {O_QUE_FAZ[p.nivel]}</dd></div>
              <div><dt>E-mail de entrada</dt><dd>{p.email}</dd></div>
              {organizacao && <div><dt>Organização</dt><dd>{organizacao}</dd></div>}
            </dl>
            <p className="nota-acesso"><Icone nome="escudo" tamanho={17} /><span>Entrada sem senha: a cada acesso, um código chega neste e-mail. Para trocar o e-mail ou o tipo de acesso, {p.nivel === 'admin' ? <>use <Link href="/app/pessoas">Pessoas e acessos</Link>.</> : 'fale com um administrador.'}</span></p>
          </section>
        </aside>
      </div>
    </div>
  );
}
