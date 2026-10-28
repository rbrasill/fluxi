// Estilos copiados da biblioteca BPMN INC (templates/drawio/biblioteca-estilos.xml).
import type { TipoNo } from './schema';

const EVENTO =
  'points=[[0.145,0.145,0],[0.5,0,0],[0.855,0.145,0],[1,0.5,0],[0.855,0.855,0],[0.5,1,0],[0.145,0.855,0],[0,0.5,0]];shape=mxgraph.bpmn.event;html=1;perimeter=ellipsePerimeter;outlineConnect=0;aspect=fixed;';
// Pergunta do gateway acima do losango ("Caixa de Texto de Condição"), para não disputar espaço com as saídas.
const GATEWAY =
  'points=[[0.25,0.25,0],[0.5,0,0],[0.75,0.25,0],[1,0.5,0],[0.75,0.75,0],[0.5,1,0],[0.25,0.75,0],[0,0.5,0]];shape=mxgraph.bpmn.gateway2;html=1;perimeter=rhombusPerimeter;outlineConnect=0;aspect=fixed;fillColor=#fad7ac;strokeColor=#b46504;verticalLabelPosition=top;verticalAlign=bottom;align=center;labelWidth=170;whiteSpace=wrap;fontFamily=Calibri;fontStyle=1;fontColor=#003049;fontSize=13;';
// Texto abaixo do evento, mais largo que o círculo.
const EVENTO_ROTULO_ABAIXO = 'verticalLabelPosition=bottom;verticalAlign=top;align=center;labelWidth=150;whiteSpace=wrap;fontSize=11;';

export const ESTILO_NO: Record<TipoNo, { estilo: string; w: number; h: number }> = {
  inicio: {
    estilo: EVENTO + 'outline=standard;symbol=general;fillColor=#13AE84;strokeColor=none;verticalLabelPosition=middle;verticalAlign=middle;labelBackgroundColor=none;fontFamily=Calibri;fontSize=15;fontColor=#FFFFFF;',
    w: 60, h: 60,
  },
  inicio_mensagem: { estilo: EVENTO + EVENTO_ROTULO_ABAIXO + 'outline=standard;symbol=message;fillColor=#7AE2CF;strokeColor=#FFFFFF;strokeWidth=2;', w: 60, h: 60 },
  inicio_condicional: { estilo: EVENTO + EVENTO_ROTULO_ABAIXO + 'outline=standard;symbol=conditional;fillColor=#306D29;strokeColor=#FFFFFF;strokeWidth=2;', w: 60, h: 60 },
  fim: {
    estilo: EVENTO + 'outline=standard;symbol=general;fillColor=#F14F21;strokeColor=none;verticalLabelPosition=middle;verticalAlign=middle;labelBackgroundColor=none;fontFamily=Calibri;fontSize=15;fontStyle=1;fontColor=#FFFFFF;',
    w: 60, h: 60,
  },
  link_entrada: { estilo: EVENTO + EVENTO_ROTULO_ABAIXO + 'outline=catching;symbol=link;strokeColor=#FFFFFF;fillColor=#FB8B24;', w: 60, h: 60 },
  link_saida: { estilo: EVENTO + EVENTO_ROTULO_ABAIXO + 'outline=throwing;symbol=link;strokeColor=#006633;fillColor=#44FF87;', w: 60, h: 60 },
  tarefa: { estilo: 'rounded=1;whiteSpace=wrap;html=1;strokeColor=#005F73;fontSize=12;', w: 160, h: 60 },
  gateway_exclusivo: { estilo: GATEWAY + 'outline=none;symbol=none;', w: 60, h: 60 },
  gateway_paralelo: { estilo: GATEWAY + 'outline=none;symbol=none;gwType=parallel;', w: 60, h: 60 },
  gateway_inclusivo: { estilo: GATEWAY + 'outline=throwing;symbol=general;', w: 60, h: 60 },
  gateway_evento: { estilo: GATEWAY + 'outline=throwing;symbol=multiple;', w: 60, h: 60 },
};

// Texto do gatilho (início) ou do resultado (fim), embaixo do círculo que mostra "Início"/"Fim" ("Label de Texto").
export const ESTILO_TEXTO_EVENTO = 'text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=center;verticalAlign=top;fontSize=11;';

// Raia sem cabeçalho e com a etiqueta da área no canto, como na biblioteca.
export const ESTILO_RAIA =
  'swimlane;html=1;startSize=0;fontStyle=0;collapsible=0;horizontal=0;swimlaneLine=1;swimlaneFillColor=none;strokeWidth=3;whiteSpace=wrap;strokeColor=#005F73;fontSize=13;';
export const ESTILO_RAIA_NOME =
  'shape=mxgraph.bpmn.task2;part=1;taskMarker=abstract;rectStyle=rounded;isLoopSub=0;topLeftStyle=square;topRightStyle=square;fillColor=#9FA1FF;whiteSpace=wrap;html=1;strokeColor=#005F73;fontStyle=1;fontColor=#FFFFFF;fontSize=13;fillStyle=solid;';

export const ESTILO_SETA =
  'endArrow=classic;html=1;rounded=1;endFill=1;strokeWidth=2;strokeColor=#415A77;startArrow=diamond;startFill=1;edgeStyle=orthogonalEdgeStyle;curved=0;';

// "Indicador de Caminho" Sim/Não; outras condições vão como texto.
export const ESTILO_INDICADOR =
  'html=1;shape=mxgraph.bootstrap.rrect;rSize=5;strokeColor=#FFFFFF;strokeWidth=2;fontColor=#FFFFFF;whiteSpace=wrap;align=center;verticalAlign=middle;fontStyle=1;fontSize=12;spacing=0;fontFamily=Calibri;';
export const ESTILO_ROTULO =
  'text;html=1;whiteSpace=wrap;align=left;verticalAlign=middle;fontFamily=Calibri;fontStyle=1;fontColor=#003049;fontSize=12;labelBackgroundColor=#ffffff;spacing=0;';
export const COR_INDICADOR: Record<string, string> = { sim: '#13AE84', não: '#DB2843', nao: '#DB2843' };

export const ESTILO_NOTA = 'rounded=1;whiteSpace=wrap;html=1;strokeColor=#005F73;align=left;spacingLeft=8;spacingRight=6;fontSize=11;';
export const ESTILO_ALERTA = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;align=left;spacingLeft=8;spacingRight=6;fontFamily=Calibri;fontColor=#4D4D4D;fontSize=12;';
export const ESTILO_LIGACAO_NOTA = 'endArrow=none;dashed=1;html=1;strokeColor=#FF3399;';
