'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/Icone';
import { destinoSeguro } from '@/lib/auth/sessao';

// Login sem senha (decisão 50): e-mail corporativo → código de 6 dígitos por e-mail → entra por 6 horas.
// Duas etapas na mesma página. Depois de entrar, recarga completa para o porteiro enxergar o cookie novo.
// O desenho (decisão 73): um cartão em duas partes sobre um fundo em degradê; à esquerda, o logo e o formulário;
// à direita, um painel lilás com a ilustração 3D do processo, que avança sobre a parte branca.

const CARENCIA_S = 60;

async function postar(url: string, corpo: object) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  const j = (await r.json().catch(() => ({}))) as { erro?: string; message?: string };
  return { ok: r.ok, status: r.status, erro: j.erro, mensagem: j.message };
}

export default function Login() {
  const [etapa, setEtapa] = useState<'email' | 'codigo'>('email');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(0);
  const campoCodigo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);
  useEffect(() => { if (etapa === 'codigo') campoCodigo.current?.focus(); }, [etapa]);

  async function pedirCodigo(e?: React.FormEvent) {
    e?.preventDefault();
    setErro('');
    setEnviando(true);
    const r = await postar('/api/auth/solicitar', { email }).catch(() => ({ ok: false, status: 0, erro: 'Sem conexão. Tente de novo.', mensagem: undefined }));
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro || 'Não foi possível enviar o código agora.');
      if (r.status === 429 && etapa === 'codigo') setEspera(CARENCIA_S);
      return;
    }
    setAviso(r.mensagem || 'Se o e-mail estiver cadastrado, o código chega em instantes.');
    setCodigo('');
    setEtapa('codigo');
    setEspera(CARENCIA_S);
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    const r = await postar('/api/auth/validar', { email, codigo }).catch(() => ({ ok: false, status: 0, erro: 'Sem conexão. Tente de novo.', mensagem: undefined }));
    if (r.ok) {
      window.location.href = destinoSeguro(new URLSearchParams(window.location.search).get('next'), window.location.origin);
      return;
    }
    setEnviando(false);
    setErro(r.erro || 'Não foi possível entrar.');
    setCodigo('');
    campoCodigo.current?.focus();
  }

  return (
    <main className="login">
      <div className="login-cartao">
        <div className="login-lado">
          <Image src="/logo-incflow-escuro.png" alt="INCFlow" width={199} height={32} priority className="login-logo" />
          {etapa === 'email' ? (
            <form onSubmit={pedirCodigo} className="login-form">
              <div className="login-topo">
                <p className="login-saudacao">Boas-vindas ao INCFlow</p>
                <h1>Entrar</h1>
                <p className="login-sub">Digite o seu e-mail corporativo. Vamos mandar um código de acesso.</p>
              </div>
              <label className="login-campo">
                <span>E-mail</span>
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@meuinc.com.br" required autoFocus />
              </label>
              {erro && <p className="login-erro" role="alert">{erro}</p>}
              <button className="login-botao" disabled={enviando || !email.trim()}>{enviando ? 'Enviando…' : 'Enviar código'}<Icone nome="seta-direita" tamanho={18} /></button>
              <p className="login-nota">Acesso sem senha: a cada entrada, você recebe um código no seu e-mail.</p>
            </form>
          ) : (
            <form onSubmit={entrar} className="login-form">
              <div className="login-topo">
                <p className="login-saudacao">Quase lá</p>
                <h1>Digite o código</h1>
                <p className="login-sub">{aviso} Ele vale por 10 minutos. Enviado para <strong>{email.trim().toLowerCase()}</strong>.</p>
              </div>
              <label className="login-campo">
                <span>Código de 6 dígitos</span>
                <input
                  ref={campoCodigo} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" className="login-codigo"
                  value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} required
                />
              </label>
              {erro && <p className="login-erro" role="alert">{erro}</p>}
              <button className="login-botao" disabled={enviando || codigo.length !== 6}>{enviando ? 'Entrando…' : 'Entrar'}<Icone nome="seta-direita" tamanho={18} /></button>
              <div className="login-links">
                <button type="button" className="link-sec" onClick={() => void pedirCodigo()} disabled={espera > 0 || enviando}>
                  {espera > 0 ? `Reenviar código (${espera}s)` : 'Reenviar código'}
                </button>
                <button type="button" className="link-sec" onClick={() => { setEtapa('email'); setErro(''); setCodigo(''); }}>Trocar e-mail</button>
              </div>
            </form>
          )}
        </div>
        <div className="login-painel" aria-hidden="true">
          <Image src="/login-ilustracao.png" alt="" width={450} height={450} priority className="login-ilustracao" />
        </div>
      </div>
    </main>
  );
}
