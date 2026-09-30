'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { listarAreas, type AreaResumo } from '@/lib/areas';
import { criarProcesso } from '@/lib/processos';

/** Diálogo de novo processo. Com `areaId`, a área já vem definida. */
export function NovoProcesso({ areaId, aoFechar }: { areaId?: string; aoFechar: () => void }) {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [area, setArea] = useState(areaId ?? '');
  const [areas, setAreas] = useState<AreaResumo[]>([]);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);

  useEffect(() => { if (!areaId) listarAreas().then(setAreas).catch(() => {}); }, [areaId]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    try {
      const p = await criarProcesso({ nome: nome.trim(), area_id: area });
      router.push(`/app/processos/${p.id}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar');
      setCriando(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="novo-processo" onClick={() => !criando && aoFechar()}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={criar}>
        <h2 id="novo-processo">Novo processo</h2>
        <label className="field">
          Nome do processo
          <input autoFocus required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Aprovação de proposta comercial" />
        </label>
        {!areaId && (
          <label className="field">
            Área
            <select required value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Escolha…</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.organizacao ? `${a.organizacao.nome} · ` : ''}{a.nome}</option>)}
            </select>
            {areas.length === 0 && <span className="notice">Crie uma organização e uma área primeiro, em Organizações.</span>}
          </label>
        )}
        {erro && <p className="form-erro" role="alert">{erro}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={aoFechar} disabled={criando}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={criando || !nome.trim() || !area}>{criando ? 'Criando…' : 'Criar e abrir'}</button>
        </div>
      </form>
    </div>
  );
}
