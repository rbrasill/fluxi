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

// Cores da biblioteca BPMN INC (sem '#', formato do draw.io).
const CORES = ['005F73', '415A77', '13AE84', 'F14F21', 'FAD7AC', 'B46504', 'DB2843', '9FA1FF', '76ABAE', 'FF3399', 'FFE6CC', 'D79B00'];

export function configuracao(biblioteca: ItemBiblioteca[]) {
  return {
    compressXml: false,
    expandLibraries: true,
    defaultLibraries: 'fluxi-bpmn-inc;general',
    libraries: [
      {
        title: { main: 'Fluxi' },
        entries: [
          {
            id: 'fluxi-bpmn-inc',
            title: { main: 'BPMN INC' },
            desc: { main: 'Biblioteca de estilos BPMN da INC' },
            libs: [{ title: { main: 'BPMN INC' }, data: biblioteca }],
          },
        ],
      },
    ],
    customPresetColors: CORES,
    defaultEdgeStyle: {
      edgeStyle: 'orthogonalEdgeStyle',
      rounded: '1',
      strokeColor: '#415A77',
      strokeWidth: '2',
      endArrow: 'classic',
      endFill: '1',
    },
    defaultVertexStyle: { strokeColor: '#005F73', fontColor: '#0E1A1F' },
  };
}

export type MensagemDrawio =
  | { event: 'configure' }
  | { event: 'init' }
  | { event: 'load' }
  | { event: 'autosave'; xml: string }
  | { event: 'save'; xml: string; exit?: boolean }
  | { event: 'export'; format: string; data: string; xml?: string }
  | { event: 'exit'; modified?: boolean };
