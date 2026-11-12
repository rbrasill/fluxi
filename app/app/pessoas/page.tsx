'use client';
import { useEffect, useState } from 'react';
import { avisar, confirmar } from '@/components/Dialogos';
import { Icone } from '@/components/Icone';
import { SoAdministradores } from '@/components/SoAdministradores';
import { ROTULO_NIVEL, alterarPessoa, criarPessoa, excluirPessoa, listarPessoas, type Nivel, type PessoaResumo } from '@/lib/pessoas';

// Pessoas e acessos (decisão 50): quem pode entrar no INCFlow. Só administradores cadastram pessoas e mudam
// acessos: o servidor recusa os outros, e a tela nem abre para eles (decisão 64).
// Entrar é sem senha: a pessoa digita o e-mail corporativo e recebe um código.

const NIVEIS: Nivel[] = ['comum', 'gestor', 'admin'];
const AJUDA_NIVEL: Record<Nivel, string> = {
  comum: 'Usa o INCFlow e conversa com a Maia quando é convidado. Não cadastra pessoas.',
  gestor: 'Também convida pessoas para conversas com a Maia. Não cadastra pessoas nem muda acessos.',
  admin: 'Também cadastra pessoas, muda acessos e vê o Painel da Maia.',
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

  return (
    <div className="page page-estreita">
      <div className="page-head">
        <div>
          <h1>Pessoas e acessos</h1>
          <p>Só quem está nesta lista consegue entrar no INCFlow. O acesso é sem senha: a pessoa digita o e-mail corporativo e recebe um código na hora.</p>
        </div>
      </div>

      <form className="cartao" onSubmit={adicionar}>
        <h3 className="sem-margem">Cadastrar pessoa</h3>
        <div className="pessoa-campos">
          <label className="field"><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required minLength={2} placeholder="Ex.: Ana Souza" /></label>
          <label className="field"><span>E-mail corporativo</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} required placeholder="ana.souza@meuinc.com.br" /></label>
          <label className="field"><span>Acesso</span>
            <select value={nivel} onChange={(e) => setNivel(e.target.value as Nivel)}>
              {NIVEIS.map((n) => <option key={n} value={n}>{ROTULO_NIVEL[n]}</option>)}
            </select>
          </label>
        </div>
        <p className="notice">{AJUDA_NIVEL[nivel]}</p>
        <div className="fluxo-acoes"><button className="btn btn-primary" disabled={salvando || nome.trim().length < 2 || !email.trim()}><Icone nome="mais" tamanho={16} />{salvando ? 'Cadastrando…' : 'Cadastrar'}</button></div>
      </form>

      {erro && <div className="aviso erro">{erro}</div>}
      {lista === null && <p className="notice">Carregando…</p>}
      {lista && lista.length > 0 && (
        <div className="lista-pops lista-pessoas">
          {lista.map((p) => (
            <article key={p.id} className="linha-pop">
              <span className="pop-icone"><Icone nome="pessoas" tamanho={20} /></span>
              <div className="pop-nome"><strong>{p.nome}{p.id === eu ? ' (você)' : ''}</strong><span>{p.email}</span></div>
              <label className="pessoa-nivel">
                <span className="sr-only">Acesso de {p.nome}</span>
                <select value={p.nivel} onChange={(e) => void mudarNivel(p, e.target.value as Nivel)} disabled={p.id === eu}>
                  {NIVEIS.map((n) => <option key={n} value={n}>{ROTULO_NIVEL[n]}</option>)}
                </select>
              </label>
              <button type="button" className="btn btn-ghost btn-excluir" onClick={() => void remover(p)} disabled={p.id === eu} title={p.id === eu ? 'Você não pode remover a si mesmo' : 'Remover o acesso'}><Icone nome="lixo" tamanho={16} />Remover</button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
