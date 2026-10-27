// Preenche o Modelo POP v3 (templates/pop/modelo-pop-v3.template.docx).
// Independente do Next/Supabase: recebe os dados e as imagens já carregadas.
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import type { ConteudoPop, Historico } from './schema';

export type DadosPop = ConteudoPop & {
  nome: string;
  codigo: string;
  identificacao: string;
  versao: string;
  criado_em: string; // ISO
  link_fluxograma?: string | null;
  historico: Historico[];
};

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const LARGURA_UTIL_EMU = 6_000_000; // ~16,6 cm (área útil da página A4 do modelo)
const ALTURA_MAX_EMU = 5_400_000; // ~15 cm, para caber na página
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Caixa de destaque do texto do passo, logo abaixo do print: fundo creme e barra laranja à esquerda.
const COR_FUNDO = 'FFF4E0';
const COR_BARRA = 'F28C28';
const COR_BORDA = 'F3D3A8';
const COR_ROTULO = 'B45309';
const COR_TEXTO = '182737';
const EMU_POR_TWIP = 635;

function tamanhoImagem(largura: number, altura: number) {
  let cx = LARGURA_UTIL_EMU;
  let cy = Math.round((cx * altura) / Math.max(1, largura));
  if (cy > ALTURA_MAX_EMU) {
    cx = Math.round((cx * ALTURA_MAX_EMU) / cy);
    cy = ALTURA_MAX_EMU;
  }
  return { cx, cy };
}

function paragrafoImagem(rId: string, idNum: number, cx: number, cy: number, nome: string, comCaixa: boolean) {
  // keepNext: o print não fica numa página e o texto dele na outra.
  return `<w:p><w:pPr>${comCaixa ? '<w:keepNext/>' : ''}<w:spacing w:before="120" w:after="${comCaixa ? 0 : 200}"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${idNum}" name="${esc(nome)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${idNum}" name="${esc(nome)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="6350"><a:solidFill><a:srgbClr val="D5DDDC"/></a:solidFill></a:ln></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

/** Texto do passo numa tabela de uma célula, com a mesma largura do print, centralizada. */
function caixaTexto(rotulo: string, texto: string, larguraTwips: number) {
  const borda = (lado: string, cor: string, sz: number) => `<w:${lado} w:val="single" w:sz="${sz}" w:space="0" w:color="${cor}"/>`;
  const linhas = texto.split(/\r?\n/).map((l) => `<w:t xml:space="preserve">${esc(l)}</w:t>`).join('<w:br/>');
  const rTexto = `<w:rPr><w:color w:val="${COR_TEXTO}"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${larguraTwips}" w:type="dxa"/><w:jc w:val="center"/>`
    + `<w:tblBorders>${borda('top', COR_BORDA, 4)}${borda('left', COR_BARRA, 24)}${borda('bottom', COR_BORDA, 4)}${borda('right', COR_BORDA, 4)}</w:tblBorders>`
    + `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="170" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="170" w:type="dxa"/></w:tblCellMar>`
    + `<w:tblLook w:val="0000"/></w:tblPr><w:tblGrid><w:gridCol w:w="${larguraTwips}"/></w:tblGrid>`
    + `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${larguraTwips}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${COR_FUNDO}"/></w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="264" w:lineRule="auto"/></w:pPr>`
    + `<w:r><w:rPr><w:b/><w:color w:val="${COR_ROTULO}"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr><w:t xml:space="preserve">${esc(rotulo)}  </w:t></w:r>`
    + `<w:r>${rTexto}${linhas}</w:r></w:p></w:tc></w:tr></w:tbl>`
    // espaço depois da caixa (e evita que duas tabelas seguidas se juntem)
    + '<w:p><w:pPr><w:spacing w:before="0" w:after="200"/></w:pPr></w:p>';
}

function paragrafoLink(rId: string | null) {
  if (!rId) return '<w:p><w:pPr><w:pStyle w:val="NoSpacing"/></w:pPr><w:r><w:t>—</w:t></w:r></w:p>';
  return `<w:p><w:pPr><w:pStyle w:val="NoSpacing"/></w:pPr><w:hyperlink r:id="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:r><w:rPr><w:color w:val="005F73"/><w:u w:val="single"/></w:rPr><w:t>Abrir diagrama</w:t></w:r></w:hyperlink></w:p>`;
}

/**
 * @param modelo  bytes do template
 * @param imagens bytes PNG por caminho (imagem_caminho dos passos)
 */
export function gerarDocx(modelo: Buffer | Uint8Array, dados: DadosPop, imagens: Map<string, Uint8Array>): Buffer {
  const zip = new PizZip(modelo);

  // Registra as imagens no pacote (media + relacionamentos) antes de renderizar.
  const relsPath = 'word/_rels/document.xml.rels';
  let rels = zip.file(relsPath)!.asText();
  const rIdDe = new Map<string, string>();
  let n = 0;
  for (const [caminho, bytes] of imagens) {
    n++;
    const rId = `rIdFluxi${n}`;
    zip.file(`word/media/fluxi_tela_${n}.png`, bytes);
    rels = rels.replace('</Relationships>', `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/fluxi_tela_${n}.png"/></Relationships>`);
    rIdDe.set(caminho, rId);
  }
  let rIdLink: string | null = null;
  if (dados.link_fluxograma) {
    rIdLink = 'rIdFluxiLink';
    rels = rels.replace('</Relationships>', `<Relationship Id="${rIdLink}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(dados.link_fluxograma)}" TargetMode="External"/></Relationships>`);
  }
  zip.file(relsPath, rels);

  const criado = new Date(dados.criado_em);
  let figura = 0;
  const contexto = {
    area: dados.area,
    nomeProcedimento: dados.nome,
    mesAno: `${MESES[criado.getMonth()]}/${criado.getFullYear()}`,
    versao: dados.versao,
    dataCriacao: criado.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    codigoProcesso: dados.codigo,
    identificacaoPop: dados.identificacao,
    executor: dados.executor,
    objetivo: dados.objetivo,
    envolvidos: dados.envolvidos,
    descricaoFluxograma: 'Diagrama do fluxo ponta a ponta',
    linkFluxograma: paragrafoLink(rIdLink),
    procedimentos: dados.procedimentos.map((p) => ({
      nome: p.nome,
      passos: p.passos.filter((s) => s.texto.trim()).map((s) => ({ texto: s.texto })),
      telas: p.passos
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.imagem_caminho && rIdDe.has(s.imagem_caminho))
        .map(({ s, i }) => {
          figura++;
          const { cx, cy } = tamanhoImagem(s.imagem_largura ?? 1600, s.imagem_altura ?? 900);
          const texto = s.texto.trim();
          const imagem = paragrafoImagem(rIdDe.get(s.imagem_caminho!)!, 1000 + figura, cx, cy, `Tela ${figura}`, !!texto);
          return {
            tela: texto ? imagem + caixaTexto(`Passo ${i + 1}`, texto, Math.round(cx / EMU_POR_TWIP)) : imagem,
          };
        }),
    })),
    historico: dados.historico.map((h) => ({ data: h.data, elaboradoPor: h.elaborado_por, revisao: h.revisao })),
  };

  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  doc.render(contexto);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
