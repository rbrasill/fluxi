// Estilos copiados da biblioteca BPMN INC (templates/drawio/biblioteca-estilos.xml).
import type { TipoNo } from './schema';

const EVENTO =
  'points=[[0.145,0.145,0],[0.5,0,0],[0.855,0.145,0],[1,0.5,0],[0.855,0.855,0],[0.5,1,0],[0.145,0.855,0],[0,0.5,0]];shape=mxgraph.bpmn.event;html=1;perimeter=ellipsePerimeter;outlineConnect=0;aspect=fixed;';
const GATEWAY =
  'points=[[0.25,0.25,0],[0.5,0,0],[0.75,0.25,0],[1,0.5,0],[0.75,0.75,0],[0.5,1,0],[0.25,0.75,0],[0,0.5,0]];shape=mxgraph.bpmn.gateway2;html=1;verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;align=center;perimeter=rhombusPerimeter;outlineConnect=0;aspect=fixed;fillColor=#fad7ac;strokeColor=#b46504;fontFamily=Helvetica;fontSize=12;whiteSpace=wrap;';
const EVENTO_ROTULO_ABAIXO = 'verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;align=center;fontSize=12;whiteSpace=wrap;';

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

export const ESTILO_RAIA =
  'swimlane;html=1;startSize=40;fontStyle=1;collapsible=0;horizontal=0;swimlaneLine=1;swimlaneFillColor=none;strokeWidth=3;whiteSpace=wrap;strokeColor=#005F73;fontSize=13;fontColor=#005F73;';

export const ESTILO_SETA =
  'edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=classic;endFill=1;strokeWidth=2;strokeColor=#415A77;fontSize=12;fontStyle=1;labelBackgroundColor=#ffffff;';

export const ESTILO_NOTA = 'text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;spacing=6;dashed=1;strokeColor=#FF3399;fillColor=#FFFFFF;fontSize=11;';
export const ESTILO_ALERTA = 'rounded=1;html=1;whiteSpace=wrap;align=left;spacing=6;fillColor=#ffe6cc;strokeColor=#d79b00;fontSize=11;';
export const ESTILO_LIGACAO_NOTA = 'endArrow=none;dashed=1;html=1;strokeColor=#FF3399;';

export const COR_ROTULO: Record<string, string> = { sim: '#13AE84', não: '#DB2843', nao: '#DB2843' };
