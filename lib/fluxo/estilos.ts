// Estilos copiados da biblioteca nova, "Biblioteca de Processos" (templates/drawio/biblioteca-estilos.xml, decisão 62):
// fundos claros com borda colorida de 1,5, fonte Poppins e quatro cores com sentido (verde começa, vermelho
// termina, amarelo decide, azul conecta), mais o cinza-azulado das caixas de apoio.
import type { TipoNo } from './schema';

export const FONTE = 'fontFamily=Poppins;fontSource=https%3A%2F%2Ffonts.googleapis.com%2Fcss%3Ffamily%3DPoppins;';
const VERDE = 'fillColor=#E7F6EE;strokeColor=#1EA65A;fontColor=#178A4A;';
const VERMELHO = 'fillColor=#FDEDED;strokeColor=#E5484D;fontColor=#D3383E;';
const AZUL = 'fillColor=#E6F6FE;strokeColor=#12A3EB;fontColor=#0B86C6;';
const AMARELO = 'fillColor=#FFF8E3;strokeColor=#F2BE22;';
const NEUTRO = 'fillColor=#FFFFFF;strokeColor=#A9BCD0;fontColor=#7B8CA4;';

const EVENTO =
  'points=[[0.145,0.145,0],[0.5,0,0],[0.855,0.145,0],[1,0.5,0],[0.855,0.855,0],[0.5,1,0],[0.145,0.855,0],[0,0.5,0]];shape=mxgraph.bpmn.event;html=1;perimeter=ellipsePerimeter;outlineConnect=0;aspect=fixed;strokeWidth=1.5;fontSize=11;align=center;labelBackgroundColor=none;' + FONTE;
// "Início" e "Fim" escritos dentro do círculo.
const NO_MEIO = 'verticalLabelPosition=middle;labelPosition=center;verticalAlign=middle;';
// Texto abaixo do evento, mais largo que o círculo.
const ABAIXO = 'verticalLabelPosition=bottom;verticalAlign=top;labelWidth=150;whiteSpace=wrap;';
// Pergunta do gateway acima do losango, no estilo da "Condição do gateway", para não disputar espaço com as saídas.
const GATEWAY =
  'points=[[0.25,0.25,0],[0.5,0,0],[0.75,0.25,0],[1,0.5,0],[0.75,0.75,0],[0.5,1,0],[0.25,0.75,0],[0,0.5,0]];shape=mxgraph.bpmn.gateway2;html=1;perimeter=rhombusPerimeter;outlineConnect=0;aspect=fixed;strokeWidth=1.5;labelBackgroundColor=none;' +
  AMARELO + 'verticalLabelPosition=top;verticalAlign=bottom;align=center;labelWidth=180;whiteSpace=wrap;fontColor=#1F1D5C;fontSize=12;fontStyle=1;' + FONTE;

export const ESTILO_NO: Record<TipoNo, { estilo: string; w: number; h: number }> = {
  inicio: { estilo: EVENTO + VERDE + NO_MEIO + 'outline=standard;symbol=general;', w: 60, h: 60 },
  inicio_mensagem: { estilo: EVENTO + VERDE + ABAIXO + 'outline=standard;symbol=message;', w: 60, h: 60 },
  inicio_condicional: { estilo: EVENTO + VERDE + ABAIXO + 'outline=standard;symbol=conditional;', w: 60, h: 60 },
  inicio_paralelo: { estilo: EVENTO + VERDE + ABAIXO + 'outline=standard;symbol=parallelMultiple;', w: 60, h: 60 },
  fim: { estilo: EVENTO + VERMELHO + NO_MEIO + 'outline=end;symbol=general;', w: 60, h: 60 },
  link_entrada: { estilo: EVENTO + AZUL + ABAIXO + 'outline=catching;symbol=link;', w: 60, h: 60 },
  link_saida: { estilo: EVENTO + AZUL + ABAIXO + 'outline=throwing;symbol=link;', w: 60, h: 60 },
  // A tarefa é a "Caixa de texto" da biblioteca, com menos margem para o texto caber em 160 × 60.
  tarefa: { estilo: 'rounded=1;absoluteArcSize=1;arcSize=12;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#A9BCD0;strokeWidth=1.5;fontColor=#52637A;fontSize=12;spacing=6;' + FONTE, w: 160, h: 60 },
  gateway_exclusivo: { estilo: GATEWAY + 'outline=none;symbol=none;', w: 60, h: 60 },
  gateway_paralelo: { estilo: GATEWAY + 'outline=none;symbol=none;gwType=parallel;', w: 60, h: 60 },
  gateway_inclusivo: { estilo: GATEWAY + 'outline=end;symbol=general;', w: 60, h: 60 },
  gateway_evento: { estilo: GATEWAY + 'outline=catching;symbol=multiple;', w: 60, h: 60 },
};

// Texto do gatilho (início) ou do resultado (fim), embaixo do círculo que mostra "Início"/"Fim" ("Label de texto"),
// na cor do próprio evento.
export const ESTILO_TEXTO_EVENTO = 'text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=center;verticalAlign=top;fontSize=11;' + FONTE;
export const COR_TEXTO_EVENTO: Partial<Record<TipoNo, string>> = { inicio: '#178A4A', fim: '#D3383E' };

// Raia de cantos arredondados, sem cabeçalho, com a etiqueta azul da área no canto, como na biblioteca.
export const ESTILO_RAIA =
  'swimlane;html=1;startSize=0;fontStyle=0;collapsible=0;horizontal=0;swimlaneLine=1;swimlaneFillColor=none;rounded=1;arcSize=12;absoluteArcSize=1;strokeWidth=1.5;strokeColor=#A9BCD0;whiteSpace=wrap;fontColor=#1F1D5C;fontSize=13;' + FONTE;
export const ESTILO_RAIA_NOME =
  'rounded=1;arcSize=50;whiteSpace=wrap;html=1;part=1;cloneable=1;fillColor=#12A3EB;strokeColor=none;fontColor=#FFFFFF;fontSize=13;fontStyle=1;' + FONTE;

// Seta principal (azul) e secundária (cinza), esta para os retornos: bolinha na saída, ponta cheia na chegada.
const SETA =
  'edgeStyle=orthogonalEdgeStyle;rounded=1;curved=0;html=1;strokeWidth=1.5;startArrow=oval;startFill=1;startSize=6;endArrow=block;endFill=1;endSize=5;jettySize=auto;orthogonalLoop=1;fontColor=#52637A;fontSize=11;labelBackgroundColor=#FFFFFF;' + FONTE;
export const ESTILO_SETA = SETA + 'strokeColor=#12A3EB;';
export const ESTILO_SETA_SECUNDARIA = SETA + 'strokeColor=#A9BCD0;';

// "Caminho Sim/Não" e "Evento ocorrido" (as saídas do gateway baseado em evento); outras condições vão como texto.
const INDICADOR = 'rounded=1;absoluteArcSize=1;arcSize=8;whiteSpace=wrap;html=1;strokeWidth=1.5;fontSize=11;fontStyle=1;align=center;verticalAlign=middle;spacing=0;' + FONTE;
export const ESTILO_INDICADOR: Record<string, string> = { sim: INDICADOR + VERDE, não: INDICADOR + VERMELHO, nao: INDICADOR + VERMELHO };
export const ESTILO_EVENTO_OCORRIDO = [INDICADOR + AZUL, INDICADOR + AMARELO + 'fontColor=#B88A00;', INDICADOR + NEUTRO];
export const ESTILO_ROTULO =
  'text;html=1;whiteSpace=wrap;align=left;verticalAlign=middle;fontStyle=1;fontColor=#52637A;fontSize=11;labelBackgroundColor=#FFFFFF;spacing=0;' + FONTE;

// Anotações: a nota é a "Caixa de texto"; o alerta, a caixa amarela com o triângulo de atenção.
export const ESTILO_NOTA = 'rounded=1;absoluteArcSize=1;arcSize=12;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#A9BCD0;strokeWidth=1.5;fontColor=#52637A;fontSize=11;align=left;spacingLeft=8;spacingRight=6;' + FONTE;
export const ESTILO_ALERTA = 'rounded=1;absoluteArcSize=1;arcSize=8;whiteSpace=wrap;html=1;fillColor=#FFF8E3;strokeColor=#F2BE22;strokeWidth=1.5;fontColor=#7A5C00;fontSize=11;align=left;verticalAlign=middle;spacingLeft=30;spacingRight=6;spacing=0;' + FONTE;
export const ESTILO_ALERTA_ICONE =
  'shape=image;aspect=fixed;imageAspect=0;verticalLabelPosition=bottom;verticalAlign=top;part=1;connectable=0;image=data:image/svg+xml,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDMuNSBMMjEuNSAyMCBIMi41IFoiIGZpbGw9IiNGRkYxQzIiIHN0cm9rZT0iI0UwQTgwMCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PHBhdGggZD0iTTEyIDkuNSBWMTQiIHN0cm9rZT0iI0I4OEEwMCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjE3IiByPSIxLjIiIGZpbGw9IiNCODhBMDAiLz48L3N2Zz4=;';
export const ESTILO_LIGACAO_NOTA = 'endArrow=none;dashed=1;html=1;strokeColor=#A9BCD0;strokeWidth=1.5;';
