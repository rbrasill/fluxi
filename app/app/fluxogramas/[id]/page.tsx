'use client';
import { useParams } from 'next/navigation';
import { EditorDrawio } from '@/components/EditorDrawio';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  return <EditorDrawio id={id} />;
}
