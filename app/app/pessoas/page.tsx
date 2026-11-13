'use client';
import { useEffect, useState } from 'react';
import { avisar, confirmar } from '@/components/Dialogos';
import { Icone } from '@/components/Icone';
import { SoAdministradores } from '@/components/SoAdministradores';
import { corDoAvatar, iniciais } from '@/lib/iniciais';
import { ROTULO_NIVEL, alterarPessoa, criarPessoa, excluirPessoa, listarPessoas, type Nivel, type PessoaResumo } from '@/lib/pessoas';

// Pessoas e acessos (decisão 50): quem pode entrar no INCFlow. Só administradores cadastram pessoas e mudam
// acessos: o servidor recusa os outros, e a tela nem abre para eles (decisão 64).
// Entrar é sem senha: a pessoa digita o e-mail corporativo e recebe um código.

const NIVEIS: Nivel[] = ['comum', 'gestor', 'admin'];
type Filtro = 'todos' | Nivel;
const FILTROS: { id: Filtro; rotulo: string }[] = [{ id: 'todos', rotulo: 'Todos' }, { id: 'admin', rotulo: 'Administradores' }, { id: 'gestor', rotulo: 'Gestores' }, { id: 'comum', rotulo: 'Comuns' }];
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const AJUDA_NIVEL: Record<Nivel, string> = {
  comum: 'Usa o INCFlow e conversa com a Maia quando é convidado. Não cadastra pessoas.',
  gestor: 'Tudo do acesso comum, e também convida pessoas para conversas com a Maia.',
  admin: 'Tudo do gestor, e também cadastra pessoas, muda acessos e vê o Painel da Maia.',
};
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Tente de novo em instantes.');

export default function PessoasPage() {
  return <SoAdministradores titulo="Pessoas e acessos"><Pessoas /></SoAdministradores>;
}

function Pessoas() {
  const [lista, setLista] = useState<PessoaResumo[] | null>(null);
  const [erro, setErro] = useState('');
  const [eu, setEu] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [nivel, setNivel] = useState<Nivel>('comum');
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [editando, setEditando] = useState<PessoaResumo | null>(null);

  const carregar = () => listarPessoas().then(setLista).catch((e) => { setErro(msg(e)); setLista([]); });
  useEffect(() => {
    void carregar();
    fetch('/api/auth/eu').then((r) => (r.ok ? r.json() : null)).then((j) => setEu(j?.personId ?? null)).catch(() => {});
  }, []);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await criarPessoa({ nome, email, nivel });
      setNome(''); setEmail(''); setNivel('comum');
      await carregar();
    } catch (err) {
      void avisar('Não foi possível cadastrar.', msg(err));
    } finally {
      setSalvando(false);
    }
  }

  async function mudarNivel(p: PessoaResumo, novo: Nivel) {
    if (!(await confirmar({ titulo: `Mudar ${p.nome} para ${ROTULO_NIVEL[novo]}?`, mensagem: 'A pessoa precisa entrar de novo para o acesso novo valer.', acao: 'Mudar' }))) return;
    try { await alterarPessoa(p.id, { nivel: novo }); await carregar(); } catch (err) { void avisar('Não foi possível mudar o acesso.', msg(err)); }
  }

  async function remover(p: PessoaResumo) {
    if (!(await confirmar({ titulo: `Remover ${p.nome}?`, mensagem: 'A pessoa deixa de conseguir entrar no INCFlow, e a sessão aberta dela cai. O que ela fez continua no sistema.', acao: 'Remover', perigo: true }))) return;
    try { await excluirPessoa(p.id); await carregar(); } catch (err) { void avisar('Não foi possível remover.', msg(err)); }
  }

  const termo = semAcento(busca.trim());
  const contagem: Record<Filtro, number> = { todos: lista?.length ?? 0, admin: 0, gestor: 0, comum: 0 };
  for (const p of lista ?? []) contagem[p.nivel]++;
  const visiveis = (lista ?? []).filter((p) => (filtro === 'todos' || p.nivel === filtro) && (!termo || semAcento(`${p.nome} ${p.email}`).includes(termo)));

  return (
    <div className="page pagina-pessoas">
      <nav className="trilha" aria-label="Caminho"><span>Conta</span><Icone nome="avancar" tamanho={14} /><span aria-current="page">Pessoas e acessos</span></nav>
      <div className="page-head">
        <div>
          <h1>Pessoas e acessos</h1>
          <p>Só quem está nesta lista entra no INCFlow.</p>
        </div>
      </div>

      <div className="proc-grade pessoas-grade">
        <section className="cartao lista-pops-cartao" aria-labelledby="titulo-pessoas">
          <div className="lista-pops-topo pessoas-topo">
            <h2 id="titulo-pessoas" className="titulo-com-conta">Pessoas com acesso{lista && <small>{lista.length} {lista.length === 1 ? 'pessoa' : 'pessoas'}</small>}</h2>
            <label className="campo-busca busca-pops">
              <Icone nome="busca" tamanho={18} />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar pessoa" />
            </label>
          </div>
          <div className="lista-pops-filtros">
            <div className="segmented filtro-pops" role="tablist" aria-label="Filtrar por acesso">
              {FILTROS.map((f) => (
                <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.rotulo}<span className="conta-aba">{contagem[f.id]}</span></button>
              ))}
            </div>
          </div>
          {erro && <p className="lista-pops-vazia form-erro" role="alert">{erro}</p>}
          {lista === null && <p className="lista-pops-vazia">Carregando…</p>}
          {lista && visiveis.length === 0 && !erro && <p className="lista-pops-vazia">{busca.trim() ? `Ninguém com “${busca.trim()}”.` : 'Ninguém com esse acesso.'}</p>}
          {visiveis.length > 0 && (
            <ul className="pops-linhas pessoas-linhas">
              {visiveis.map((p) => (
                <li key={p.id} className="pop-linha pessoa-linha">
                  <span className={`avatar avatar-grande avatar-${corDoAvatar(p.email)}`} aria-hidden="true">{iniciais(p.nome)}</span>
                  <div className="pop-linha-info">
                    <strong className="pessoa-nome">{p.nome}{p.id === eu ? <span className="chip-voce">você</span> : null}</strong>
                    <span className="pessoa-email">{p.email}</span>
                  </div>
                  <label className={`pessoa-nivel nivel-${p.nivel}`}>
                    <span className="sr-only">Acesso de {p.nome}</span>
                    <select value={p.nivel} onChange={(e) => void mudarNivel(p, e.target.value as Nivel)} disabled={p.id === eu} title={p.id === eu ? 'Você não pode mudar o próprio acesso' : undefined}>
                      {NIVEIS.map((n) => <option key={n} value={n}>{ROTULO_NIVEL[n]}</option>)}
                    </select>
                  </label>
                  <button type="button" className="btn btn-ghost btn-icon btn-editar-pessoa" onClick={() => setEditando(p)} aria-label={`Editar ${p.nome}`} title="Editar nome e e-mail"><Icone nome="editar" tamanho={18} /></button>
                  <button type="button" className="btn btn-ghost btn-icon btn-lixo" onClick={() => void remover(p)} disabled={p.id === eu} aria-label={`Remover ${p.nome}`} title={p.id === eu ? 'Você não pode remover a si mesmo' : 'Remover o acesso'}><Icone nome="lixo" tamanho={18} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="proc-coluna">
          <form className="cartao cartao-lateral" onSubmit={adicionar} aria-labelledby="titulo-cadastrar">
            <div className="lateral-topo">
              <span className="lateral-icone icone-indigo"><Icone nome="pessoa-mais" tamanho={20} /></span>
              <h3 id="titulo-cadastrar">Cadastrar pessoa</h3>
            </div>
            <label className="field"><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required minLength={2} placeholder="Ex.: Ana Souza" /></label>
            <label className="field"><span>E-mail corporativo</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} required placeholder="ana.souza@meuinc.com.br" /></label>
            <fieldset className="opcoes-acesso">
              <legend>Acesso</legend>
              {NIVEIS.map((n) => (
                <label key={n} className={`opcao-acesso${nivel === n ? ' marcada' : ''}`}>
                  <input type="radio" name="nivel" value={n} checked={nivel === n} onChange={() => setNivel(n)} />
                  <span><strong>{ROTULO_NIVEL[n]}</strong><small>{AJUDA_NIVEL[n]}</small></span>
                </label>
              ))}
            </fieldset>
            <button className="btn btn-primary btn-largo" disabled={salvando || nome.trim().length < 2 || !email.trim()}><Icone nome="mais" tamanho={16} />{salvando ? 'Cadastrando…' : 'Cadastrar pessoa'}</button>
          </form>

          <section className="cartao cartao-lateral" aria-labelledby="titulo-sem-senha">
            <div className="lateral-topo">
              <span className="lateral-icone icone-verde"><Icone nome="escudo" tamanho={20} /></span>
              <h3 id="titulo-sem-senha">Acesso sem senha</h3>
            </div>
            <p className="lateral-texto">A pessoa digita o e-mail corporativo na tela de entrada e recebe um código na hora. Ao remover alguém daqui, o acesso deixa de funcionar.</p>
          </section>
        </aside>
      </div>
      {editando && <EditarPessoa pessoa={editando} souEu={editando.id === eu} aoSalvar={() => { setEditando(null); void carregar(); }} aoFechar={() => setEditando(null)} />}
    </div>
  );
}

// Corrigir o nome ou o e-mail de quem já está cadastrado (um erro de digitação no cadastro, por exemplo).
function EditarPessoa({ pessoa, souEu, aoSalvar, aoFechar }: { pessoa: PessoaResumo; souEu: boolean; aoSalvar: () => void; aoFechar: () => void }) {
  const [nome, setNome] = useState(pessoa.nome);
  const [email, setEmail] = useState(pessoa.email);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const mudouEmail = email.trim().toLowerCase() !== pessoa.email;
  const mudou = mudouEmail || nome.trim() !== pessoa.nome;

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !salvando) aoFechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [salvando, aoFechar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro('');
    try {
      await alterarPessoa(pessoa.id, { nome: nome.trim(), ...(mudouEmail ? { email: email.trim() } : {}) });
      aoSalvar();
    } catch (err) {
      setErro(msg(err));
      setSalvando(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="editar-pessoa-titulo" onClick={() => !salvando && aoFechar()}>
      <form className="dialog dialogo-editar-pessoa" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <div className="dialogo-topo">
          <span className="lateral-icone icone-indigo"><Icone nome="editar" tamanho={20} /></span>
          <div className="dialogo-topo-texto"><h2 id="editar-pessoa-titulo">Editar pessoa</h2></div>
          <button type="button" className="btn btn-ghost btn-icon dialog-fechar" onClick={aoFechar} disabled={salvando} title="Fechar" aria-label="Fechar"><Icone nome="fechar" tamanho={18} /></button>
        </div>
        <label className="field"><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required minLength={2} autoFocus /></label>
        <label className="field">
          <span>E-mail corporativo</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} required disabled={souEu} />
          <small className="field-ajuda">{souEu ? 'Você não pode mudar o seu próprio e-mail. Peça a outro administrador.' : 'A pessoa passa a entrar com o e-mail novo. Se ela estiver com o INCFlow aberto, precisa entrar de novo.'}</small>
        </label>
        {erro && <p className="form-erro" role="alert">{erro}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={aoFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando || !mudou || nome.trim().length < 2 || !email.trim()}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  );
}
