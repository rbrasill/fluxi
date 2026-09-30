import { redirect } from 'next/navigation';

// As áreas agora ficam dentro de cada organização.
export default function AreasPage() {
  redirect('/app/organizacoes');
}
