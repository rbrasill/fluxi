// Armazenamento provisório no navegador (localStorage) para testar o editor.
// Será trocado pela API Express + Supabase, mantendo esta mesma interface.
import { gerarCodigo } from './codigo';

export type Fluxograma = {
  id: string;
  codigo: string;
  nome: string;
  xml: string;
  miniatura?: string; // SVG em data URI
  criadoEm: string;
  atualizadoEm: string;
};

export type FluxogramaResumo = Omit<Fluxograma, 'xml'>;

const INDICE = 'fluxi:fluxogramas';
const chave = (id: string) => `fluxi:fluxograma:${id}`;

function lerIndice(): FluxogramaResumo[] {
  try {
    return JSON.parse(localStorage.getItem(INDICE) || '[]');
  } catch {
    return [];
  }
}

function gravarIndice(itens: FluxogramaResumo[]) {
  localStorage.setItem(INDICE, JSON.stringify(itens));
}

export function listar(): FluxogramaResumo[] {
  return lerIndice().sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
}

export function obter(id: string): Fluxograma | null {
  const resumo = lerIndice().find((f) => f.id === id);
  if (!resumo) return null;
  return { ...resumo, xml: localStorage.getItem(chave(id)) || '' };
}

export function criar(nome: string, xml: string): Fluxograma {
  const agora = new Date().toISOString();
  const f: Fluxograma = { id: crypto.randomUUID(), codigo: gerarCodigo(), nome, xml, criadoEm: agora, atualizadoEm: agora };
  localStorage.setItem(chave(f.id), xml);
  const { xml: _x, ...resumo } = f;
  gravarIndice([...lerIndice(), resumo]);
  return f;
}

export function salvar(id: string, dados: Partial<Pick<Fluxograma, 'nome' | 'xml' | 'miniatura'>>) {
  const itens = lerIndice();
  const i = itens.findIndex((f) => f.id === id);
  if (i < 0) return;
  if (dados.xml !== undefined) localStorage.setItem(chave(id), dados.xml);
  const { xml: _x, ...resto } = dados;
  itens[i] = { ...itens[i], ...resto, atualizadoEm: new Date().toISOString() };
  try {
    gravarIndice(itens);
  } catch {
    // Miniatura grande demais para o localStorage: salva sem ela.
    itens[i] = { ...itens[i], miniatura: undefined };
    gravarIndice(itens);
  }
}

export function duplicar(id: string): Fluxograma | null {
  const f = obter(id);
  return f ? criar(`${f.nome} (cópia)`, f.xml) : null;
}

export function excluir(id: string) {
  localStorage.removeItem(chave(id));
  gravarIndice(lerIndice().filter((f) => f.id !== id));
}
