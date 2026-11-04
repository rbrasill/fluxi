'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { EditorDrawio } from '@/components/EditorDrawio';

function Editor() {
  const { id } = useParams<{ id: string }>();
  // ?voltar=/app/pops/<id>: quem abriu a partir do POP volta para o POP. Só caminhos do próprio app.
  const voltar = useSearchParams().get('voltar');
  return <EditorDrawio id={id} voltar={voltar && /^\/app\/[\w\-/]+$/.test(voltar) ? voltar : null} />;
}

export default function EditorPage() {
  return <Suspense><Editor /></Suspense>;
}
