// O que a entrevista com a IA precisa descobrir sobre o processo (decisão 39). A IA marca os tópicos
// cobertos a cada resposta e escolhe a próxima pergunta pelo que falta; a tela mostra o andamento.
export const TOPICOS = [
  { id: 'objetivo', nome: 'Objetivo', o_que: 'para que o processo existe e o que entrega no fim' },
  { id: 'gatilho', nome: 'Início', o_que: 'o que dispara o processo, quem pede e com que frequência acontece' },
  { id: 'etapas', nome: 'Etapas', o_que: 'a sequência de atividades do início ao fim, na ordem em que acontecem' },
  { id: 'responsaveis', nome: 'Responsáveis', o_que: 'quem faz cada etapa (cargo ou área) e quem aprova' },
  { id: 'ferramentas', nome: 'Ferramentas', o_que: 'sistemas, planilhas, formulários e documentos usados em cada etapa' },
  { id: 'entradas', nome: 'Entradas', o_que: 'o que precisa existir ou chegar para cada etapa acontecer' },
  { id: 'saidas', nome: 'Saídas', o_que: 'o que cada etapa produz e para quem vai' },
  { id: 'regras', nome: 'Regras', o_que: 'prazos, critérios de decisão, alçadas e aprovações' },
  { id: 'excecoes', nome: 'Exceções', o_que: 'o que acontece quando algo sai do padrão e os caminhos alternativos' },
  { id: 'dificuldades', nome: 'Dificuldades', o_que: 'gargalos, retrabalho, esperas e o que costuma dar problema' },
  { id: 'confirmacao', nome: 'Confirmação', o_que: 'a pessoa ouviu o resumo do processo e confirmou (ou corrigiu)' },
] as const;

export type TopicoId = (typeof TOPICOS)[number]['id'];
export const IDS_TOPICOS: readonly string[] = TOPICOS.map((t) => t.id);

export type Turno = { quem: 'ia' | 'pessoa'; texto: string; em: string };

export type StatusEntrevista = 'em_andamento' | 'processando' | 'concluida' | 'erro';
export const ROTULO_STATUS: Record<StatusEntrevista, string> = { em_andamento: 'Em andamento', processando: 'Gerando o resultado', concluida: 'Concluída', erro: 'Erro ao gerar o resultado' };

export type Etapa = {
  nome: string;
  responsavel: string;
  descricao: string;
  ferramentas: string[];
  entradas: string[];
  saidas: string[];
  regras: string[];
  excecoes: string[];
};

export type ResultadoEntrevista = {
  descricao: string; // HTML simples (p, ul, ol, li, strong, em)
  ficha: { objetivo: string; gatilho: string; resultado: string; etapas: Etapa[]; dificuldades: string[] };
  pendencias: string[];
};

/** A conversa em texto (para o fluxograma e para a leitura). */
export const transcricaoDaConversa = (turnos: Turno[]) =>
  turnos.map((t) => `${t.quem === 'ia' ? 'Entrevistador' : 'Entrevistado'}: ${t.texto}`).join('\n');
