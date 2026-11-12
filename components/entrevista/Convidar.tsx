'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from '@/components/Icone';
import { ehAdmin, useEu } from '@/lib/auth/eu';
import { corDoAvatar, iniciais } from '@/lib/iniciais';
import { MAX_CONVITES } from '@/lib/entrevista/topicos';
import { convidarParaEntrevista, type ResultadoConvite } from '@/lib/entrevistas';
import { listarConvidaveis, type PessoaConvidavel } from '@/lib/pessoas';

// Convidar para entrevista com a Maia (decisão 53): quem é gestor ou administrador escolhe até três pessoas
// cadastradas e, se quiser, diz o que a Maia deve focar. Cada pessoa recebe um e-mail e ganha a sua entrevista.

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Tente de novo em instantes.');
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Convidar({ processoId, processoNome, indisponiveis, notaInicial = '', dica, aoConvidar, aoFechar }: {
  processoId: string; processoNome: string;
  indisponiveis: string[]; // quem já tem entrevista aberta neste processo
  notaInicial?: string; // o pedido já escrito (perguntas para outra pessoa, decisão 58)
  dica?: string; // por exemplo, "Escolha alguém de Financeiro."
  aoConvidar: (r: ResultadoConvite) => void; aoFechar: () => void;
}) {
  const admin = ehAdmin(useEu());
  const [pessoas, setPessoas] = useState<PessoaConvidavel[] | null>(null);
  const [busca, setBusca] = useState('');
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [nota, setNota] = useState(notaInicial);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { listarConvidaveis().then(setPessoas).catch((e) => { setErro(msg(e)); setPessoas([]); }); }, []);
  const filtradas = useMemo(() => {
    const q = normalizar(busca.trim());
    return (pessoas ?? []).filter((p) => !q || normalizar(`${p.nome} ${p.email}`).includes(q));
  }, [pessoas, busca]);
  const cheio = marcadas.length >= MAX_CONVITES;

  function alternar(id: string) {
    setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : m.length < MAX_CONVITES ? [...m, id] : m));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!marcadas.length) return;
    setEnviando(true);
    setErro('');
    try {
      aoConvidar(await convidarParaEntrevista(processoId, { pessoas: marcadas, nota: nota.trim() || undefined }));
    } catch (err) {
      setErro(msg(err));
      setEnviando(false);
    }
  }

  // Vai direto no corpo da página: quem abre o diálogo pode estar numa aba escondida (o cartão da visão geral do processo).
  return createPortal(
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="convidar-titulo" onClick={() => !enviando && aoFechar()}>
      <form className="dialog dialog-lg dialogo-convite" onClick={(e) => e.stopPropagation()} onSubmit={enviar}>
        <div className="dialogo-topo">
          <span className="lateral-icone icone-maia"><Icone nome="microfone" tamanho={20} /></span>
          <div className="dialogo-topo-texto">
            <h2 id="convidar-titulo">Convidar para entrevista com a Maia</h2>
            <p className="notice">Cada pessoa recebe um e-mail com o convite e conversa com a Maia sobre <b>{processoNome}</b> quando puder. Até {MAX_CONVITES} pessoas por vez, uma entrevista para cada uma.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon dialog-fechar" onClick={aoFechar} disabled={enviando} title="Fechar" aria-label="Fechar"><Icone nome="fechar" tamanho={18} /></button>
        </div>
        {dica && <p className="notice convite-dica">{dica}</p>}
        <label className="campo-busca">
          <span className="sr-only">Buscar pessoa</span>
          <Icone nome="busca" tamanho={18} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar pessoa" autoFocus />
        </label>
        <div className="lista-pessoas" role="group" aria-label="Pessoas cadastradas">
          {pessoas === null && <p className="notice">Carregando…</p>}
          {pessoas && filtradas.length === 0 && <p className="notice">{pessoas.length ? 'Ninguém com esse nome.' : (admin ? 'Nenhuma pessoa cadastrada ainda. Cadastre em Pessoas e acessos.' : 'Nenhuma pessoa cadastrada ainda. Peça a um administrador para cadastrar em Pessoas e acessos.')}</p>}
          {filtradas.map((p) => {
            const marcada = marcadas.includes(p.id);
            const aberta = indisponiveis.includes(p.id);
            return (
              <label key={p.id} className={`pessoa-opcao${marcada ? ' marcada' : ''}${aberta ? ' indisponivel' : ''}`}>
                <span className={`avatar avatar-${corDoAvatar(p.email || p.nome)}`} aria-hidden="true">{iniciais(p.nome)}</span>
                <span className="pessoa-opcao-nome">{p.nome}<small>{p.email}</small></span>
                {aberta && <span className="pessoa-opcao-aviso">Já tem entrevista aberta</span>}
                <input type="checkbox" checked={marcada} disabled={aberta || (!marcada && cheio)} onChange={() => alternar(p.id)} />
              </label>
            );
          })}
        </div>
        <label className="field">
          <span>O que a Maia deve focar <span className="opcional">(opcional)</span></span>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} rows={3} placeholder="Ex.: concentre nas aprovações e no que acontece quando o pedido é negado." />
        </label>
        {erro && <p className="form-erro" role="alert">{erro}</p>}
        <div className="dialog-actions">
          <span className="convite-contagem"><b>{marcadas.length}</b> de {MAX_CONVITES} {marcadas.length === 1 ? 'pessoa escolhida' : 'pessoas escolhidas'}</span>
          <button type="button" className="btn" onClick={aoFechar} disabled={enviando}>Cancelar</button>
          <button type="submit" className="btn btn-maia" disabled={enviando || marcadas.length === 0}>
            <Icone nome="microfone" tamanho={16} />{enviando ? 'Enviando…' : marcadas.length > 1 ? `Enviar ${marcadas.length} convites` : 'Enviar convite'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
