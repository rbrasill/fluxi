'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { avisar, confirmar } from '@/components/Dialogos';
import { SeloSituacao } from '@/components/entrevista/SeloSituacao';
import { ehGestor, souEu, useEu } from '@/lib/auth/eu';
import { useAcompanharEntrevistas } from '@/lib/entrevista/acompanhar';
import { confirmacaoDeExclusao, excluirEntrevista, listarEntrevistas, quandoFoiAEntrevista, restaurarEntrevista, type EntrevistaResumo } from '@/lib/entrevistas';

// Conversas com a Maia (decisões 41, 53 e 60): as entrevistas nascem por convite, dentro do processo. Quem é comum
// vê só as suas conversas; gestores e administradores veem as suas e as das outras pessoas. Cada linha diz de que
// processo é a entrevista e quando ela foi (data e hora). Sem custos nem indicadores (decisão 52). Enquanto a
// pessoa está na ligação, a linha mostra "Em andamento" e ninguém mais abre a conversa (decisão 69). As entrevistas
// arquivadas de todos os processos ficam numa aba à parte, só para gestores e administradores; arquivar e excluir
// definitivamente são dentro da entrevista (decisão 72).

const duracao = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);

export default function EntrevistasPage() {
  const eu = useEu();
  const gestor = ehGestor(eu);
  const [lista, setLista] = useState<EntrevistaResumo[] | null>(null);
  const [aba, setAba] = useState<'ativas' | 'arquivadas'>('ativas');
  const [aviso, setAviso] = useState('');

  const carregar = () => listarEntrevistas().then(setLista).catch(() => setLista([]));
  useEffect(() => { void carregar(); }, []);
  useAcompanharEntrevistas(lista, () => listarEntrevistas().then(setLista).catch(() => {})); // se falhar, fica a lista que já estava

  const msg = (e: unknown) => (e instanceof Error ? e.message : 'Tente de novo em instantes.');
  async function cancelar(x: EntrevistaResumo) {
    if (!(await confirmar(confirmacaoDeExclusao(x)))) return;
    try { await excluirEntrevista(x.id); setAviso(`Convite de ${x.entrevistado ?? 'a pessoa'} cancelado.`); await carregar(); } catch (e) { void avisar('Não foi possível cancelar o convite.', msg(e)); }
  }
  async function restaurar(x: EntrevistaResumo) {
    try { await restaurarEntrevista(x.id); setAviso(`Entrevista de ${x.entrevistado ?? 'a pessoa'} restaurada: voltou para a lista de entrevistas ativas do processo.`); await carregar(); } catch (e) { void avisar('Não foi possível restaurar a entrevista.', msg(e)); }
  }

  const aberta = (x: EntrevistaResumo) => x.status === 'convidada' || x.status === 'em_andamento';
  const ativas = (lista ?? []).filter((x) => !x.arquivado_em);
  const arquivadas = gestor ? (lista ?? []).filter((x) => !!x.arquivado_em) : [];
  const abaAtual = arquivadas.length ? aba : 'ativas';
  const minhas = ativas.filter((x) => eu?.enabled && souEu(eu, x.entrevistado_id));
  const outras = ativas.filter((x) => !minhas.includes(x));
  const ordem = (a: EntrevistaResumo, b: EntrevistaResumo) => Number(aberta(b)) - Number(aberta(a));

  const linha = (x: EntrevistaResumo) => {
    if (x.arquivado_em) {
      return (
        <article key={x.id} className="linha-pop arquivada" data-status={x.status} data-arquivada="sim">
          <span className="pop-icone"><Icone nome="arquivar" tamanho={20} /></span>
          <Link href={`/app/entrevistas/${x.id}`} className="pop-nome">
            <span className="rotulo-processo">{x.processo ? `Processo${x.processo.area ? ` · ${x.processo.area.nome}` : ''}` : 'Sem processo'}</span>
            <strong>{x.processo?.nome ?? x.tema ?? 'Entrevista'}</strong>
            <span>{x.entrevistado ? `${x.entrevistado} · ` : ''}Arquivada em {new Date(x.arquivado_em).toLocaleDateString('pt-BR')}{x.arquivado_por ? ` por ${x.arquivado_por}` : ''}</span>
          </Link>
          <SeloSituacao entrevista={x} />
          <button type="button" className="btn btn-ghost" onClick={() => void restaurar(x)} title="Devolve a entrevista à lista de ativas do processo"><Icone nome="desfazer" tamanho={16} />Restaurar</button>
          <Link className="btn" href={`/app/entrevistas/${x.id}`}>Abrir</Link>
        </article>
      );
    }
    const minha = souEu(eu, x.entrevistado_id);
    const fechada = x.em_ligacao && !minha; // a pessoa está na ligação: só ela entra na conversa
    const Nome = fechada ? 'div' : Link;
    return (
      <article key={x.id} className="linha-pop" data-status={x.status} data-em-ligacao={x.em_ligacao ? 'sim' : undefined}>
        <span className="pop-icone icone-entrevista"><Icone nome="conversa" tamanho={20} /></span>
        <Nome href={`/app/entrevistas/${x.id}`} className="pop-nome">
          <span className="rotulo-processo">{x.processo ? `Processo${x.processo.area ? ` · ${x.processo.area.nome}` : ''}` : 'Sem processo'}</span>
          <strong>{x.processo?.nome ?? x.tema ?? 'Entrevista'}</strong>
          <span>{!minha && x.entrevistado ? `${x.entrevistado} · ` : ''}{quandoFoiAEntrevista(x)}{x.duracao_s ? ` · ${duracao(x.duracao_s)}` : ''}{x.falas > 0 ? ` · ${x.falas} ${x.falas === 1 ? 'fala' : 'falas'}` : ''}</span>
        </Nome>
        <SeloSituacao entrevista={x} />
        {gestor && x.status === 'convidada' && (
          <button type="button" className="btn btn-ghost btn-excluir" onClick={() => void cancelar(x)} title="Cancela o convite"><Icone nome="lixo" tamanho={16} />Cancelar</button>
        )}
        {fechada
          ? <span className="nota-ao-vivo">Abre quando a ligação terminar</span>
          : aberta(x) && minha
            ? <Link className="btn btn-primary" href={`/app/entrevistas/${x.id}`}><Icone nome="microfone" tamanho={16} />{x.falas > 0 ? 'Continuar' : 'Ligar para a Maia'}</Link>
            : <Link className="btn btn-primary" href={`/app/entrevistas/${x.id}`}>Abrir</Link>}
      </article>
    );
  };

  return (
    <div className="page page-estreita">
      <div className="page-head">
        <div>
          <h1>Conversas com a Maia</h1>
          <p>{gestor
            ? 'A Maia entrevista por voz quem executa um processo, como numa ligação, e no fim escreve a descrição, uma ficha e o que ficou em aberto. As entrevistas são criadas por convite, dentro de cada processo.'
            : 'Aqui ficam as suas conversas com a Maia. Cada uma é sobre um processo: ela pergunta como o trabalho funciona, como numa ligação, e no fim escreve o que você contou.'}</p>
        </div>
      </div>

      {arquivadas.length > 0 && (
        <div className="segmented abas-arquivo abas-entrevistas" role="tablist" aria-label="Conversas">
          <button type="button" role="tab" aria-selected={abaAtual === 'ativas'} onClick={() => { setAba('ativas'); setAviso(''); }}>Ativas <span className="conta-aba">{ativas.length}</span></button>
          <button type="button" role="tab" aria-selected={abaAtual === 'arquivadas'} onClick={() => { setAba('arquivadas'); setAviso(''); }}>Arquivadas <span className="conta-aba">{arquivadas.length}</span></button>
        </div>
      )}
      {aviso && <div className="aviso retomar" role="status"><span>{aviso}</span></div>}
      {lista === null && <p className="notice">Carregando…</p>}
      {lista?.length === 0 && (
        <div className="empty">
          <h2>Nenhuma conversa ainda</h2>
          <p>{gestor ? 'Para entrevistar alguém, abra o processo e clique em "Convidar para entrevista".' : 'Quando alguém convidar você para uma conversa com a Maia, ela aparece aqui e você recebe um e-mail.'}</p>
          {gestor && <Link href="/app/areas" className="btn btn-primary">Ir para as áreas</Link>}
        </div>
      )}

      {abaAtual === 'arquivadas' && (
        <section className="secao-processo">
          <div className="secao-head"><h2><Icone nome="arquivar" tamanho={18} />Conversas arquivadas</h2></div>
          <div className="lista-pops lista-entrevistas">{arquivadas.map(linha)}</div>
        </section>
      )}
      {abaAtual === 'ativas' && lista !== null && lista.length > 0 && ativas.length === 0 && <p className="notice">Nenhuma conversa ativa.</p>}
      {abaAtual === 'ativas' && minhas.length > 0 && (
        <section className="secao-processo">
          <div className="secao-head"><h2><Icone nome="microfone" tamanho={18} />Suas conversas</h2></div>
          <div className="lista-pops lista-entrevistas">{[...minhas].sort(ordem).map(linha)}</div>
        </section>
      )}
      {abaAtual === 'ativas' && outras.length > 0 && (
        <section className="secao-processo">
          <div className="secao-head"><h2><Icone nome="conversa" tamanho={18} />{minhas.length ? 'Conversas de outras pessoas' : 'Conversas'}</h2></div>
          <div className="lista-pops lista-entrevistas">{[...outras].sort(ordem).map(linha)}</div>
        </section>
      )}
    </div>
  );
}
