// Integração com o draw.io em modo embed (ver docs/drawio-embed.md).
export const DRAWIO_ORIGIN = 'https://embed.diagrams.net';

export const DRAWIO_URL =
  `${DRAWIO_ORIGIN}/?` +
  new URLSearchParams({
    embed: '1',
    proto: 'json',
    configure: '1',
    libraries: '1',
    spin: '1',
    noExitBtn: '1',
    lang: 'pt-br',
  }).toString();

type ItemBiblioteca = { xml: string; w: number; h: number; title: string };

// Cores da Biblioteca de Processos (decisão 62), sem '#', no formato do draw.io: verde, vermelho, azul e
// amarelo (borda, texto e fundo de cada um), os cinza-azulados das caixas de apoio e o azul-escuro dos títulos.
const CORES = [
  '1EA65A', '178A4A', 'E7F6EE', 'E5484D', 'D3383E', 'FDEDED',
  '12A3EB', '0B86C6', 'E6F6FE', 'F2BE22', 'B88A00', 'FFF8E3',
  'A9BCD0', '7B8CA4', '52637A', 'D3DEE8', 'F4F8FB', '1F1D5C',
];
const FONTE = { fontFamily: 'Poppins', fontSource: 'https%3A%2F%2Ffonts.googleapis.com%2Fcss%3Ffamily%3DPoppins' };

export function configuracao(biblioteca: ItemBiblioteca[]) {
  return {
    compressXml: false,
    expandLibraries: true,
    defaultLibraries: 'fluxi-bpmn-inc;general',
    libraries: [
      {
        title: { main: 'INCFlow' },
        entries: [
          {
            id: 'fluxi-bpmn-inc',
            title: { main: 'Biblioteca de Processos' },
            desc: { main: 'Elementos de fluxograma da INC' },
            libs: [{ title: { main: 'Biblioteca de Processos' }, data: biblioteca }],
          },
        ],
      },
    ],
    customPresetColors: CORES,
    // O que a pessoa desenha fora da biblioteca já sai no mesmo estilo: a seta principal e a caixa de texto.
    defaultEdgeStyle: {
      edgeStyle: 'orthogonalEdgeStyle',
      rounded: '1',
      curved: '0',
      strokeColor: '#12A3EB',
      strokeWidth: '1.5',
      startArrow: 'oval',
      startFill: '1',
      startSize: '6',
      endArrow: 'block',
      endFill: '1',
      endSize: '5',
      fontColor: '#52637A',
      fontSize: '11',
      ...FONTE,
    },
    defaultVertexStyle: { strokeColor: '#A9BCD0', strokeWidth: '1.5', fontColor: '#52637A', ...FONTE },
    customFonts: [{ fontFamily: 'Poppins', fontUrl: 'https://fonts.googleapis.com/css?family=Poppins' }],
  };
}

export type MensagemDrawio =
  | { event: 'configure' }
  | { event: 'init' }
  | { event: 'load' }
  | { event: 'autosave'; xml: string }
  | { event: 'save'; xml: string; exit?: boolean }
  | { event: 'export'; format: string; data: string; xml?: string; message?: { fluxi?: string } } // message: o pedido original
  | { event: 'exit'; modified?: boolean };
