import { NextResponse } from 'next/server';
import { catalogo } from '@/lib/server/icones';

/**
 * O catálogo de ícones do seletor (decisão 133): todos os ícones do Lucide, com nome, palavras de busca e categoria em
 * português. Só é pedido quando alguém abre o seletor; o navegador guarda por um dia (muda só com a versão do Lucide).
 */
export const GET = () => NextResponse.json(catalogo(), { headers: { 'cache-control': 'private, max-age=86400' } });
