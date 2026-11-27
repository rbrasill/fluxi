import 'server-only';
import nosDoLucide from 'lucide-static/icon-nodes.json';
import traducoes from '@/lib/icones/pt.json';
import { CATEGORIAS_DE_ICONES, type CatalogoDeIcones, type IconeDoProcesso, type ItemDoCatalogo, type NoDoIcone, CORES_DO_PROCESSO } from '@/lib/icones';
import { ErroApi } from './http';

// Catálogo de ícones (decisão 133): os desenhos vêm do pacote `lucide-static` (versão fixada no package.json, licença
// ISC); o nome em português, as palavras de busca e a categoria de cada um ficam em `lib/icones/pt.json`. Um ícone novo
// do Lucide sem tradução aparece com o nome em inglês, na última categoria, até ganhar a dele.
export const VERSAO_DO_LUCIDE = '1.80.0';
const NOS = nosDoLucide as unknown as Record<string, NoDoIcone[]>;
const PT = traducoes as unknown as Record<string, [string, string, string]>;

// Só o que um desenho do Lucide usa: qualquer outra marca ou atributo fica de fora do que é guardado e mostrado.
const MARCAS = new Set(['path', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect']);
const ATRIBUTOS = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'points', 'fill']);
const limpar = (nos: NoDoIcone[]): NoDoIcone[] => nos.filter(([m]) => MARCAS.has(m))
  .map(([m, a]) => [m, Object.fromEntries(Object.entries(a).filter(([k, v]) => ATRIBUTOS.has(k) && typeof v === 'string' && (k !== 'fill' || v === 'none' || v === 'currentColor')))]);

const legivel = (nome: string) => { const t = nome.replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };

let pronto: CatalogoDeIcones | null = null;
/** Todos os ícones, em ordem alfabética do nome em português. */
export function catalogo(): CatalogoDeIcones {
  if (pronto) return pronto;
  const ultima = CATEGORIAS_DE_ICONES.length - 1;
  const icones: ItemDoCatalogo[] = Object.keys(NOS).map((nome) => {
    const t = PT[nome];
    const cat = t ? (CATEGORIAS_DE_ICONES as readonly string[]).indexOf(t[2]) : -1;
    return [nome, t?.[0] || legivel(nome), t?.[1] ?? '', cat >= 0 ? cat : ultima, limpar(NOS[nome])] as ItemDoCatalogo;
  }).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR') || a[0].localeCompare(b[0]));
  pronto = { versao: VERSAO_DO_LUCIDE, categorias: CATEGORIAS_DE_ICONES, icones };
  return pronto;
}

/**
 * O que é guardado no processo: o nome, a cor e o desenho, sempre tirado do catálogo do servidor (o navegador só manda
 * o nome). Nome que não existe no Lucide é recusado.
 */
export function montarIcone(nome: string, cor: number | null): IconeDoProcesso {
  const nos = Object.prototype.hasOwnProperty.call(NOS, nome) ? NOS[nome] : null;
  if (!nos) throw new ErroApi(400, 'Ícone desconhecido.');
  if (cor !== null && !CORES_DO_PROCESSO[cor]) throw new ErroApi(400, 'Cor desconhecida.');
  return { nome, cor, nos: limpar(nos) };
}
