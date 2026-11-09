'use client';
import { useState } from 'react';

/** Diálogo simples de criação: um campo de nome (e, se vierem, um campo a mais e uma linha explicando onde o item entra). */
export function DialogoNome({ titulo, rotulo, exemplo, aviso, extra, aoCriar, aoFechar }: {
  titulo: string; rotulo: string; exemplo: string;
  aviso?: React.ReactNode;
  extra?: React.ReactNode;
  aoCriar: (nome: string) => Promise<void>;
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    setErro('');
    try {
      await aoCriar(nome.trim());
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar');
      setCriando(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="dialogo-nome" onClick={() => !criando && aoFechar()}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={enviar}>
        <h2 id="dialogo-nome">{titulo}</h2>
        <label className="field">
          {rotulo}
          <input autoFocus required maxLength={200} value={nome} onChange={(e) => setNome(e.target.value)} placeholder={exemplo} />
        </label>
        {extra}
        {aviso && <p className="notice">{aviso}</p>}
        {erro && <p className="form-erro" role="alert">{erro}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={aoFechar} disabled={criando}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={criando || !nome.trim()}>{criando ? 'Criando…' : 'Criar e abrir'}</button>
        </div>
      </form>
    </div>
  );
}
