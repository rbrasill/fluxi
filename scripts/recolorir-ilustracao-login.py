# Troca as cores da ilustração do login pelas do sistema de cores (decisão 75) e tira o fundo branco (decisão 76).
# Uso: python3 scripts/recolorir-ilustracao-login.py <ilustração original.svg> public/login-ilustracao.svg
import re, sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
MAPA = {
    # fundo da mancha atrás da cena: mais claro que o painel índigo-100
    '#DAE3FE': '#F8FAFF', '#E9EFFD': '#FFFFFF', '#DCE5FE': '#F8FAFF',
    # contornos, moldura, cabelo, poste: índigo 950
    '#1A0F91': '#1E1B4B', '#09005D': '#1E1B4B', '#020039': '#1E1B4B', '#090056': '#1E1B4B',
    '#150E42': '#1E1B4B', '#1A1B80': '#1E1B4B', '#2B3582': '#1E1B4B',
    # círculos do fluxo, placa azul, roupas: índigo 700 e 500
    '#4042E2': '#4338CA', '#3840F7': '#4338CA', '#2C50FF': '#4338CA', '#4F52FF': '#6366F1',
    # detalhes médios e claros (folhas, linhas, papéis, engrenagens): índigo 300 e 100
    '#7D97F4': '#A5B4FC', '#91B3FA': '#A5B4FC', '#BDD0FB': '#E0E7FF',
    # coral: pêssego e rosa (diamante, terminais, lâmpada, placas, blusa)
    '#FF928E': '#FDBA74', '#FE7062': '#FB7185', '#E9605A': '#FB7185', '#E1473D': '#FB7185',
    # pele: rosa 100
    '#FEB3B1': '#FDE1E7',
    # ciano: teal 300
    '#53D8FF': '#A8DADC',
}
def troca(m):
    c = m.group(0).upper()
    return MAPA.get(c, m.group(0))
s = re.sub(r'#[0-9A-Fa-f]{6}\b', troca, s)
# sem o retângulo branco do fundo: a cena fica sobre o painel
s = re.sub(r'<g id="Background">\s*<rect[^>]*/>\s*</g>', '', s)
# limpeza: comentário do gerador, espaços
s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
s = re.sub(r'>\s+<', '><', s)
s = re.sub(r'[\t\r\n]+', ' ', s)
s = s.replace('<?xml version="1.0" encoding="utf-8"?>', '<?xml version="1.0" encoding="utf-8"?>\n')
open(dst, 'w', encoding='utf-8').write(s)
restantes = sorted(set(c.upper() for c in re.findall(r'#[0-9A-Fa-f]{6}\b', s)))
print('cores no resultado:', ' '.join(restantes))
print('tamanho:', len(s.encode()))
