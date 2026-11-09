'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { mmss, seg, usd } from '@/components/entrevista/Metricas';
import { ROTULO_STATUS } from '@/lib/entrevista/topicos';
import { obterPainelDaMaia, type EntrevistaPainel, type PainelMaia } from '@/lib/maia';

// Painel da Maia (decisão 52), só administradores: o acumulado e o custo de cada entrevista, o resumo por
// mês e como a Maia está configurada. Quem é entrevistado não vê número nenhum: a tela da entrevista é só
// a ligação e o resultado.

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const nomeDoMes = (iso: string) => { const s = new Date(iso).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };
const chaveMes = (iso: string) => iso.slice(0, 7);
const duracao = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);
const situacao = (x: EntrevistaPainel) => (x.status === 'em_andamento' && x.falas > 0 ? 'Pausada' : ROTULO_STATUS[x.status]);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export default function PainelMaiaPage() {
  const [p, setP] = useState<PainelMaia | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => { obterPainelDaMaia().then(setP).catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar o painel.')); }, []);

  const cabecalho = (
    <div className="page-head">
      <div>
        <h1>Painel da Maia</h1>
        <p>Custos, tempos e indicadores das entrevistas, e como a Maia está configurada. Só administradores veem esta página; quem é entrevistado vê só a ligação e o resultado.</p>
      </div>
    </div>
  );
  if (erro) return <div className="page">{cabecalho}<div className="aviso erro">{erro}</div></div>;
  if (!p) return <div className="page">{cabecalho}<p className="notice">Carregando…</p></div>;

  const { configuracao: c, entrevistas } = p;
  const soma = (lista: EntrevistaPainel[], f: (x: EntrevistaPainel) => number) => lista.reduce((a, x) => a + f(x), 0);
  const totais = (lista: EntrevistaPainel[]) => ({
    n: lista.length, voz_s: soma(lista, (x) => x.duracao_s), sessoes: soma(lista, (x) => x.sessoes), consultas: soma(lista, (x) => x.consultas),
    voz: soma(lista, (x) => x.custo_voz_usd), custo_consultas: soma(lista, (x) => x.custo_consultas_usd), analise: soma(lista, (x) => x.custo_analise_usd), total: soma(lista, (x) => x.custo_total_usd),
  });
  const t = totais(entrevistas);
  const concluidas = entrevistas.filter((x) => x.status === 'concluida').length;
  // Os meses em que houve entrevista, do mais recente para o mais antigo.
  const meses = [...new Map(entrevistas.map((x) => [chaveMes(x.criado_em), x.criado_em])).entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <div className="page">
      {cabecalho}

      <dl className="metricas-entrevista totais-maia">
        <div><dt>Entrevistas</dt><dd>{t.n}<small>{plural(concluidas, 'concluída', 'concluídas')}</small></dd></div>
        <div><dt>Tempo de voz</dt><dd>{duracao(t.voz_s)}<small>{plural(t.sessoes, 'sessão', 'sessões')}</small></dd></div>
        <div><dt>Custo da voz</dt><dd title={`${usd(c.preco_voz_usd_min)} por minuto de ligação`}>{usd(t.voz)}</dd></div>
        <div><dt>Consultas</dt><dd title="O que a Maia foi verificar durante as conversas">{t.consultas}<small>{usd(t.custo_consultas)}</small></dd></div>
        <div><dt>Análises</dt><dd title="A descrição, a ficha e as pendências, no fim de cada entrevista">{usd(t.analise)}</dd></div>
        <div><dt>Custo total</dt><dd title="Voz + consultas + análises">{usd(t.total)}{t.n > 0 && <small>{usd(t.total / t.n)} por entrevista</small>}</dd></div>
      </dl>

      {meses.length > 1 && (
        <div className="cartao">
          <h3 className="sem-margem">Por mês</h3>
          <div className="tabela-rolagem">
            <table className="tabela-maia tabela-meses">
              <thead><tr><th>Mês</th><th className="col-num">Entrevistas</th><th className="col-num">Tempo de voz</th><th className="col-num">Voz</th><th className="col-num">Consultas</th><th className="col-num">Análises</th><th className="col-num">Total</th></tr></thead>
              <tbody>
                {meses.map(([k, iso]) => {
                  const m = totais(entrevistas.filter((x) => chaveMes(x.criado_em) === k));
                  return (
                    <tr key={k}><td>{nomeDoMes(iso)}</td><td className="col-num">{m.n}</td><td className="col-num">{duracao(m.voz_s)}</td><td className="col-num">{usd(m.voz)}</td><td className="col-num">{usd(m.custo_consultas)}</td><td className="col-num">{usd(m.analise)}</td><td className="col-num"><strong>{usd(m.total)}</strong></td></tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className="secao-processo">
        <div className="secao-head"><h2><Icone nome="conversa" tamanho={18} />Entrevistas</h2></div>
        {entrevistas.length === 0 ? <p className="notice">Nenhuma entrevista ainda.</p> : (
          <div className="tabela-rolagem">
            <table className="tabela-maia tabela-entrevistas">
              <thead>
                <tr>
                  <th>Entrevista</th><th>Quando</th><th>Situação</th>
                  <th className="col-num" title="Tempo de sessão de voz (o que é cobrado)">Duração</th>
                  <th className="col-num" title="Do fim da fala da pessoa ao início da resposta da Maia (mediana)">Reação</th>
                  <th className="col-num" title="Do clique até a voz conectar (última sessão)">Conexão</th>
                  <th className="col-num">Voz</th><th className="col-num">Consultas</th><th className="col-num">Análise</th><th className="col-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {entrevistas.map((x) => (
                  <tr key={x.id}>
                    <td><Link href={`/app/maia/${x.id}`}>{x.tema || 'Entrevista'}</Link><small>{x.entrevistado ?? 'sem entrevistado'}</small></td>
                    <td>{data(x.criado_em)}</td>
                    <td>{situacao(x)}{x.erros ? <small>{plural(x.erros, 'erro', 'erros')}</small> : null}</td>
                    <td className="col-num">{x.duracao_s ? mmss(x.duracao_s) : '—'}<small>{plural(x.sessoes, 'sessão', 'sessões')}{x.pausas ? ` · ${plural(x.pausas, 'pausa', 'pausas')}` : ''}</small></td>
                    <td className="col-num">{seg(x.reacao_mediana_ms)}</td>
                    <td className="col-num">{seg(x.conexao_ms)}</td>
                    <td className="col-num">{usd(x.custo_voz_usd)}</td>
                    <td className="col-num">{x.consultas}<small>{usd(x.custo_consultas_usd)}</small></td>
                    <td className="col-num">{usd(x.custo_analise_usd)}</td>
                    <td className="col-num"><strong>{usd(x.custo_total_usd)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="cartao">
        <h3 className="sem-margem">Como a Maia está configurada</h3>
        <dl className="config-maia">
          <dt>Nome e apresentação</dt><dd>{c.apresentacao}. O nome da empresa é dito como se fala: “Ínqui”.</dd>
          <dt>Voz</dt><dd>{c.modelo_voz} (OpenAI), voz “{c.voz}” · {usd(c.preco_voz_usd_min)} por minuto de ligação, cobrado por segundo, com ou sem alguém falando.</dd>
          <dt>Consultas durante a conversa</dt><dd>{c.modelo_consulta} (Anthropic), quando ela diz “deixa eu ver aqui” · até {c.max_consultas} por sessão.</dd>
          <dt>Análise no fim</dt><dd>{c.modelo_analise} (Anthropic): a descrição do processo, a ficha e o que ficou em aberto.</dd>
          <dt>Limites da ligação</dt><dd>Até {c.sessao_min} minutos por sessão. Pausa sozinha depois de {c.inatividade_min} minutos sem ninguém falar ou se a conexão cair; pausar e encerrar fecham a sessão na hora, e sair da página também.</dd>
          <dt>Frases que a tela reconhece</dt><dd>“{c.frase_final}” encerra a entrevista e gera o resultado; “{c.frase_pausa}” pausa para continuar depois.</dd>
        </dl>
        <p className="notice">Modelos e voz mudam pelas variáveis INCFLOW_MODELO_VOZ, INCFLOW_VOZ_ENTREVISTA, INCFLOW_MODELO_CONSULTA e INCFLOW_MODELO_ANALISE, na Vercel. O resto (o jeito de conversar, os limites e as frases) está no código.</p>
      </div>
    </div>
  );
}
