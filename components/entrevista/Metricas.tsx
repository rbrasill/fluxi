import { resumoMetricas, type Consulta, type Metricas } from '@/lib/entrevista/topicos';

// Indicadores, custos e diagnóstico de uma entrevista (decisão 52): aparecem só no Painel da Maia, para
// administradores. Quem é entrevistado vê a ligação e o resultado, sem número nenhum.

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const seg = (ms?: number | null) => (ms === undefined || ms === null ? '—' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);
// Centavos; abaixo de um centavo (as consultas custam frações), quatro casas.
export const usd = (v: number) => `US$ ${v.toFixed(v > 0 && v < 0.01 ? 4 : 2).replace('.', ',')}`;

/** Indicadores da conversa (os da especificação de voz full duplex) e os custos. */
export function PainelMetricas({ metricas }: { metricas: Metricas }) {
  const r = resumoMetricas(metricas);
  const pct = (x?: number) => (x === undefined ? '—' : `${Math.round(x * 100)}%`);
  return (
    <dl className="metricas-entrevista">
      <div><dt>Reação da Maia</dt><dd title="Do fim da fala da pessoa ao início da resposta da Maia: mediana (e a maior)">{seg(r.reacao_mediana_ms)}{r.reacao_max_ms !== undefined && <small>máx. {seg(r.reacao_max_ms)}</small>}</dd></div>
      <div><dt>Falas por cima da Maia</dt><dd title="Vezes em que a pessoa falou enquanto a Maia falava (ou numa pausa curta dela)">{r.sobreposicoes} de {r.falas_pessoa}<small>{r.falas_ia} respostas da Maia</small></dd></div>
      <div><dt>Tempo de fala</dt><dd title="Quanto do tempo falado foi da pessoa e quanto foi da Maia">{pct(r.participacao_pessoa)} pessoa<small>{mmss(metricas.tempo_pessoa_s ?? 0)} pessoa · {mmss(metricas.tempo_ia_s ?? 0)} Maia</small></dd></div>
      <div><dt>Sinais de escuta</dt><dd title='"aham", "sei", "uhum" da Maia enquanto a pessoa explicava'>{r.apoios}<small>maior silêncio {seg(r.silencio_max_ms)}</small></dd></div>
      <div><dt>Consultas da Maia</dt><dd title='Vezes em que a Maia foi verificar algo ("deixa eu ver aqui"): quanto a pessoa esperou pela resposta (mediana) e o custo'>{r.consultas}{r.consultas > 0 && <small>{seg(r.consulta_mediana_ms)} · {usd(r.custo_consultas_usd)}</small>}</dd></div>
      <div><dt>Custo da voz</dt><dd title="GPT-Live: US$ 0,05 por minuto de sessão, cobrado por segundo">{usd(r.custo_voz_usd)}<small>{mmss(metricas.duracao_s ?? 0)} · {metricas.sessoes ?? 1} {(metricas.sessoes ?? 1) === 1 ? 'sessão' : 'sessões'}</small></dd></div>
      <div><dt>Custo da análise</dt><dd title="Claude, no fim: a descrição, a ficha e as pendências">{metricas.analise ? usd(r.custo_analise_usd) : '—'}{metricas.analise && <small>{(metricas.analise.vezes ?? 1) > 1 ? `${metricas.analise.vezes} análises · ` : ''}{(metricas.analise.entrada_tokens / 1000).toFixed(1).replace('.', ',')}k + {(metricas.analise.saida_tokens / 1000).toFixed(1).replace('.', ',')}k tokens</small>}</dd></div>
      <div><dt>Custo total</dt><dd title="Voz + consultas + análise">{usd(r.custo_total_usd)}</dd></div>
    </dl>
  );
}

/** Os detalhes em prosa: a análise, as sessões, as etapas da conexão e os sinais de escuta. */
export function DetalhesMetricas({ m }: { m: Metricas }) {
  const a = m.analise;
  const c = m.conexao_etapas;
  const sinais = Object.entries(m.apoios_por_sinal ?? {}).sort((x, y) => y[1] - x[1]);
  const sessoes = m.sessoes ?? 1;
  const fechadas = m.eventos?.['session.closed'];
  return (
    <p className="notice">
      {a ? `Análise com ${a.modelo}: ${a.entrada_tokens.toLocaleString('pt-BR')} tokens de entrada, ${a.saida_tokens.toLocaleString('pt-BR')} de saída${(a.vezes ?? 1) > 1 ? `, somando ${a.vezes} análises (o resultado foi refeito ao completar a entrevista; a última levou ${Math.round((a.demora_ms ?? 0) / 1000)} s)` : a.demora_ms ? `, em ${Math.round(a.demora_ms / 1000)} s` : ''}. ` : ''}
      {sessoes > 1 ? `A conversa teve ${sessoes} sessões de voz${m.pausas ? ` (${m.pausas} ${m.pausas === 1 ? 'pausa' : 'pausas'})` : ''}. ` : ''}
      {fechadas !== undefined ? `Sessões desligadas com confirmação da OpenAI: ${fechadas} de ${sessoes}. ` : ''}
      {m.conexao_ms !== undefined ? `Abertura${sessoes > 1 ? ' (última sessão)' : ''}: a voz conectou ${seg(m.conexao_ms)} depois do clique${c ? ` (microfone ${seg(c.microfone_ms)}, conexão ${seg(c.oferta_ms)}, servidor ${seg(c.servidor_ms)}${c.openai_ms !== undefined ? `, dos quais OpenAI ${seg(c.openai_ms)}` : ''}, início da sessão ${seg(c.inicio_ms)})` : ''}${m.abertura_ms !== undefined ? ` e a Maia começou a falar ${seg(m.abertura_ms)} depois` : ''}. ` : ''}
      {sinais.length ? `Sinais de escuta: ${sinais.map(([k, n]) => `"${k}" ${n}`).join(', ')}. ` : ''}
      Reação: do fim da fala da pessoa ao início da resposta da Maia, sem contar os sinais de escuta. Custos pelas tabelas da OpenAI (US$ 0,05/min) e da Anthropic.
    </p>
  );
}

/** O que a Maia foi verificar durante a conversa, a resposta que recebeu e quanto a pessoa esperou. */
export function Consultas({ lista, aberto = false }: { lista: Consulta[]; aberto?: boolean }) {
  return (
    <details className="diagnostico" open={aberto}><summary>Consultas da Maia durante a conversa ({lista.length})</summary>
      <ul className="ficha-lista">
        {lista.map((c, i) => (
          <li key={i}>{c.falhou ? <><strong>Não deu certo:</strong> {c.resposta}</> : <><strong>{c.pergunta}</strong> {c.resposta}</>} <small>({seg(c.demora_ms)}{c.falhou ? '' : ` · ${usd(c.custo_usd)}`})</small></li>
        ))}
      </ul>
    </details>
  );
}

/** Erros, eventos não tratados, a contagem de eventos do GPT-Live e os ids das sessões (para conferir na OpenAI). */
export function Diagnostico({ m, sessoes = [] }: { m: Metricas; sessoes?: string[] }) {
  const eventos = Object.entries(m.eventos ?? {}).sort((x, y) => y[1] - x[1]);
  if (!m.erros?.length && !m.desconhecidos?.length && !eventos.length && !sessoes.length) return null;
  return (
    <details className="cartao diagnostico" open={!!m.erros?.length}>
      <summary>Diagnóstico da sessão de voz</summary>
      {m.erros?.length ? <><span className="ficha-rotulo">Erros</span><ul className="ficha-lista">{m.erros.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null}
      {m.desconhecidos?.length ? <><span className="ficha-rotulo">Eventos não tratados</span><p className="notice">{m.desconhecidos.join(', ')}</p></> : null}
      {eventos.length ? <><span className="ficha-rotulo">Eventos do GPT-Live</span><p className="notice">{eventos.map(([k, n]) => `${k} ${n}`).join(' · ')}</p></> : null}
      {sessoes.length ? <><span className="ficha-rotulo">Sessões (ids na OpenAI)</span><p className="notice">{sessoes.join(', ')}</p></> : null}
    </details>
  );
}
