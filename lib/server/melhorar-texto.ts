import 'server-only';
import { z } from 'zod';
import { normalizarHtml, textoPuro } from '@/lib/pop/texto-rico';
import { completarJson } from './groq';
import { ErroApi } from './http';

// Revisão do texto de um passo (ou do objetivo) do POP com IA: corrige e deixa mais claro, sem
// inventar nada e mantendo a formatação. A pessoa vê a sugestão e decide se usa (decisão 30).

export type PedidoMelhoria = {
  campo: 'passo' | 'objetivo';
  texto: string;
  pop?: string; // nome do POP
  procedimento?: string; // nome do procedimento do passo
  numero?: number; // número do passo
  anterior?: string; // texto do passo anterior (contexto)
  seguinte?: string; // texto do passo seguinte (contexto)
};

const Resposta = z.object({ texto: z.string(), mudancas: z.array(z.string()) });

const SCHEMA = {
  nome: 'texto_revisado',
  definicao: {
    type: 'object',
    properties: {
      texto: { type: 'string', description: 'O texto revisado, em HTML com as mesmas tags permitidas do original.' },
      mudancas: { type: 'array', items: { type: 'string' }, description: 'O que foi mudado, em frases curtas (vazio se nada mudou).' },
    },
    required: ['texto', 'mudancas'],
    additionalProperties: false,
  },
};

const REGRAS_CAMPO = {
  passo: `É a instrução de UM passo do procedimento. Comece pelo verbo no imperativo ("Acesse", "Clique em", "Preencha", "Confira"). Uma ação por frase, na ordem em que acontecem. Se o texto tiver várias ações, pode separá-las em lista numerada.`,
  objetivo: `É o OBJETIVO do processo: 1 a 3 frases dizendo para que serve o procedimento e qual resultado ele garante. Não descreva os passos.`,
};

const curto = (s: string | undefined, n = 400) => {
  const t = textoPuro(s ?? '');
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

function montarPrompt(p: PedidoMelhoria, html: string) {
  const contexto = [
    p.pop && `POP: ${p.pop}`,
    p.procedimento && `Procedimento: ${p.procedimento}`,
    p.numero && `Passo número ${p.numero}`,
    p.anterior && `Passo anterior (só contexto, não reescreva): ${curto(p.anterior)}`,
    p.seguinte && `Passo seguinte (só contexto, não reescreva): ${curto(p.seguinte)}`,
  ].filter(Boolean).join('\n');
  return `Você revisa textos de POPs (Procedimentos Operacionais Padrão) de uma empresa brasileira. Revise o texto abaixo.

${REGRAS_CAMPO[p.campo]}

Regras:
- Corrija ortografia, acentuação, gramática, concordância e pontuação.
- Deixe mais claro e objetivo: frases curtas, linguagem simples e profissional, sem gírias. Português do Brasil.
- NÃO invente nada: nada de passos, campos, valores, prazos, nomes ou regras que não estejam no texto. Não remova informação.
- Mantenha exatamente como estão os nomes de sistemas, telas, botões, menus, campos, siglas e códigos. Se já estiverem entre aspas ou em negrito, mantenha.
- Mantenha a formatação: devolva HTML usando só estas tags: <p>, <br>, <strong>, <em>, <u>, <s>, <ul>, <ol>, <li>, <table>, <tbody>, <tr>, <th>, <td>, <span style="color: #RRGGBB"> e <mark data-color="#RRGGBB">. Trechos que estavam em negrito, coloridos ou marcados continuam assim; listas continuam listas; tabelas mantêm as linhas e colunas.
- Se o texto já estiver bom, devolva-o igual e "mudancas" vazio.
- Em "mudancas", diga em até 5 frases curtas o que mudou (ex.: "Corrigi a concordância em 'os campos obrigatório'").
${contexto ? `\nContexto:\n${contexto}\n` : ''}
Texto a revisar (HTML):
${html}`;
}

export async function melhorarTexto(p: PedidoMelhoria) {
  const html = normalizarHtml(p.texto);
  if (!textoPuro(html)) throw new ErroApi(400, 'Escreva o texto antes de pedir a melhoria.');
  const { resultado, modelo } = await completarJson(
    { prompt: montarPrompt(p, html), schema: SCHEMA, esforco: 'low', maxTokens: 4096, temperatura: 0.3 },
    (bruto) => {
      const r = Resposta.parse(bruto);
      // O que a IA devolve passa pelo mesmo filtro do editor: só as tags e cores permitidas.
      const texto = normalizarHtml(r.texto);
      if (!textoPuro(texto)) throw new Error('texto revisado vazio');
      return { texto, mudancas: r.mudancas.map((m) => m.trim()).filter(Boolean).slice(0, 6) };
    },
  );
  return { ...resultado, igual: textoPuro(resultado.texto) === textoPuro(html), modelo };
}
