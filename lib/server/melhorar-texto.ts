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

// Regras ajustadas lendo os POPs reais (decisão 30): autores usam imperativo ou infinitivo (os dois
// aparecem em POPs publicados), alguns narram ("acessamos", "seguimos"); números nos textos costumam
// apontar os números marcados no print ou continuar a lista do passo anterior; há títulos dentro do
// passo, links, caminhos de pasta e de menu, códigos do eSocial e rótulos de tela em MAIÚSCULAS.
const REGRAS_CAMPO = {
  passo: `É a instrução de UM passo do procedimento. O passo acompanha um print da tela, que você não vê.
- Escreva como instrução direta. Se o autor usa imperativo ("Acesse", "Clique") ou infinitivo ("Acessar", "Clicar"), mantenha a forma dele e a dos passos vizinhos. Texto narrado ("acessamos", "seguimos", "iremos coletar") ou na voz passiva ("deverá ser realizada a conferência") vira instrução direta nessa mesma forma; se não houver forma definida, use o imperativo.
- Uma ação por frase, na ordem em que acontecem.
- Itens numerados ("1 -", "1.", "4.") costumam corresponder aos números marcados no print ou continuar a numeração do passo anterior: mantenha os mesmos números, a mesma ordem e a mesma quantidade de itens, um por linha, no formato que o autor usou. Não renumere, não junte nem divida itens e não crie numeração onde não havia.
- Títulos e subtítulos dentro do texto (ex.: "Validação da Assinatura Digital", "Resultado da Validação") continuam em linha própria; se o texto começa com um título, deixe-o em negrito.
- Referências ao print ("na tela abaixo", "ícones destacados", "na aba sinalizada") continuam no texto.`,
  objetivo: `É o OBJETIVO do processo: para que serve o procedimento e qual resultado ele garante. Escreva em frases completas, sem descrever os passos. Não resuma nem encurte um objetivo longo: só corrija e deixe mais claro. Se for só um título ou um fragmento, transforme numa frase completa com as mesmas informações.`,
};

const EXEMPLOS = `Exemplos (antes → depois):
<p>Iniciamos o processo pela planilha de admissão do RH, onde iremos coletar NOME, CPF e DATA DE ADMISSÃO.</p>
→ <p>Inicie o processo pela planilha de admissão do RH e colete NOME, CPF e DATA DE ADMISSÃO.</p>
<p>1 - Faça a pesquisa pelo seu nome dos itens  aprovados.</p><p>2 - Selecione o box</p><p>3 - Clique em aplicar</p>
→ <p>1 - Pesquise pelo seu nome os itens aprovados.</p><p>2 - Selecione o box.</p><p>3 - Clique em Aplicar.</p>
<p>4.	Clique em Sistemas Gerais e Portais.</p><p>5.	Selecione a opção Fluig.</p>
→ igual (já está bom; a numeração continua a do passo anterior).`;

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
- Mantenha exatamente como estão: nomes de sistemas e portais (ex.: RM, TOTVS, Fluig, Agidesk, eSocial, Approvo, Gov.br), telas, abas, menus, botões, campos e opções; siglas e códigos (ex.: ASO, CID, S-2220, B31, NR-7, "02 - Alteração de Função"); textos em MAIÚSCULAS ou entre aspas (costumam ser o nome exato na tela: não mude nem a acentuação); links, caminhos de pasta (ex.: Z:\\Pasta\\Arquivo) e de menu (ex.: "Administração de Pessoal > Funcionário", "A → B").
- Texto muito curto ou que é só uma referência ao print (ex.: "2", "caminho pasta"): devolva igual.
- Mantenha a estrutura: títulos, linhas em branco (<p></p>) e a ordem do conteúdo.
- Mantenha a formatação: devolva HTML usando só estas tags: <p>, <br>, <strong>, <em>, <u>, <s>, <ul>, <ol>, <li>, <table>, <tbody>, <tr>, <th>, <td>, <span style="color: #RRGGBB"> e <mark data-color="#RRGGBB">. Trechos em negrito, coloridos ou marcados continuam assim; listas continuam listas; tabelas mantêm as linhas e colunas.
- Se o texto já estiver bom, devolva-o igual e "mudancas" vazio.
- Em "mudancas", diga em até 5 frases curtas o que mudou (ex.: "Corrigi a concordância em 'os campos obrigatório'").

${EXEMPLOS}
${contexto ? `\nContexto:\n${contexto}\n` : ''}
Texto a revisar (HTML):
${html}`;
}

export async function melhorarTexto(p: PedidoMelhoria) {
  const html = normalizarHtml(p.texto);
  if (!textoPuro(html)) throw new ErroApi(400, 'Escreva o texto antes de pedir a melhoria.');
  const { resultado, modelo } = await completarJson(
    // Textos longos (títulos, listas, vários itens) pedem mais cuidado com a estrutura: raciocínio médio.
    { prompt: montarPrompt(p, html), schema: SCHEMA, esforco: html.length > 1200 ? 'medium' : 'low', maxTokens: 6000, temperatura: 0.3 },
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
