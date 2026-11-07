'use client';
import { useEffect, useRef } from 'react';

// A "presença" da IA na entrevista (decisão 42): uma esfera de malha, azul num lado e magenta no outro, que
// se deforma como um líquido, gira devagar e tem partículas em volta. Enquanto a IA fala, a malha ondula com
// a voz dela; quando a pessoa fala, as partículas se aproximam e brilham (a esfera "escuta"). Desenhada num
// canvas 2D: a malha é uma grade de latitude e longitude, deformada por ondas e projetada com uma leve
// perspectiva; a cor vem de um gradiente pela posição na tela, como na referência.

export type Niveis = { ia: number; pessoa: number }; // volume de cada lado, de 0 a 1
export type ModoOrbe = 'conectando' | 'conversa' | 'processando';

const LAT = 22;
const LON = 44;
const PARTICULAS = 150;

export function Orbe({ modo, niveis, tamanho = 260 }: { modo: ModoOrbe; niveis?: React.RefObject<Niveis | null>; tamanho?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const modoRef = useRef(modo);
  modoRef.current = modo;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = tamanho * dpr;
    canvas.height = tamanho * dpr;
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const cx = (tamanho * dpr) / 2;
    const cy = cx;
    const R = tamanho * dpr * 0.34;

    // Direções dos vértices da malha (vetores unitários), fixas; o raio de cada um muda a cada quadro.
    const dirs = new Float32Array((LAT + 1) * (LON + 1) * 3);
    for (let i = 0; i <= LAT; i++) {
      const th = (Math.PI * i) / LAT;
      for (let j = 0; j <= LON; j++) {
        const ph = (2 * Math.PI * j) / LON;
        const k = (i * (LON + 1) + j) * 3;
        dirs[k] = Math.sin(th) * Math.cos(ph);
        dirs[k + 1] = Math.cos(th);
        dirs[k + 2] = Math.sin(th) * Math.sin(ph);
      }
    }
    const px = new Float32Array((LAT + 1) * (LON + 1));
    const py = new Float32Array((LAT + 1) * (LON + 1));
    const pz = new Float32Array((LAT + 1) * (LON + 1));
    const rnd = Math.random;
    const particulas = Array.from({ length: PARTICULAS }, () => ({ th: Math.acos(2 * rnd() - 1), ph: 2 * Math.PI * rnd(), r: 1.12 + rnd() * 0.42, v: (rnd() - 0.5) * 0.12, f: rnd() * 2 * Math.PI, s: 0.8 + rnd() * 1.3 }));

    let ia = 0;
    let pessoa = 0;
    let ang = 0;
    let ultimo = performance.now();
    const t0 = ultimo;
    let raf = 0;
    const suav = (atual: number, alvo: number, k: number) => atual + (alvo - atual) * k;

    const desenhar = (agora: number) => {
      const dt = Math.min(0.05, (agora - ultimo) / 1000);
      ultimo = agora;
      const t = (agora - t0) / 1000;
      const m = modoRef.current;
      const n = niveis?.current ?? { ia: 0, pessoa: 0 };
      const alvoIa = m === 'conversa' ? n.ia : m === 'processando' ? 0.3 + 0.25 * Math.sin(t * 2.4) : 0.05;
      const alvoPessoa = m === 'conversa' ? n.pessoa : 0;
      ia = suav(ia, alvoIa, alvoIa > ia ? 0.3 : 0.07);
      pessoa = suav(pessoa, alvoPessoa, alvoPessoa > pessoa ? 0.3 : 0.07);
      const amp = (reduzido ? 0.03 : 0.065) + 0.22 * ia + 0.03 * pessoa;
      const vel = (m === 'conectando' ? 0.9 : 0.2 + 0.45 * ia) * (reduzido ? 0.4 : 1);
      ang += vel * dt;
      const w = t * (0.6 + 1.3 * ia);
      const cosA = Math.cos(ang), sinA = Math.sin(ang);
      const tilt = 0.38 + 0.08 * Math.sin(t * 0.35);
      const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
      const respira = 1 + (reduzido ? 0 : 0.012 * Math.sin(t * 1.1));

      // Vértices: raio deformado por ondas, rotação em Y, inclinação em X, perspectiva leve.
      for (let v = 0; v < px.length; v++) {
        const dx = dirs[v * 3], dy = dirs[v * 3 + 1], dz = dirs[v * 3 + 2];
        const onda = 0.55 * Math.sin(3.6 * dx + w) * Math.cos(2.9 * dy - 0.8 * w)
          + 0.35 * Math.sin(5.3 * dz + 1.3 * w) * Math.sin(2.2 * dx + 0.5 * w)
          + 0.25 * Math.sin(4.6 * (dx + dy) - 1.1 * w);
        const r = respira * (1 + amp * onda);
        const x = dx * r, y = dy * r, z = dz * r;
        const x1 = x * cosA + z * sinA, z1 = -x * sinA + z * cosA;
        const y2 = y * cosT - z1 * sinT, z2 = y * sinT + z1 * cosT;
        const persp = 1 + 0.16 * z2;
        px[v] = cx + x1 * R * persp;
        py[v] = cy - y2 * R * persp;
        pz[v] = z2;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Halo de luz atrás da esfera.
      const halo = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R * 1.6);
      halo.addColorStop(0, `rgba(96, 86, 255, ${0.26 + 0.3 * ia})`);
      halo.addColorStop(0.55, `rgba(168, 64, 255, ${0.12 + 0.12 * ia})`);
      halo.addColorStop(1, 'rgba(255, 60, 214, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.6, 0, 2 * Math.PI);
      ctx.fill();

      // Cor pela posição: azul em cima à esquerda, magenta embaixo à direita.
      const grad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      grad.addColorStop(0, '#4f86ff');
      grad.addColorStop(0.5, '#9a5cff');
      grad.addColorStop(1, '#ff3ad6');

      // Linhas da malha, separadas em fundo e frente pela profundidade.
      const fundo = new Path2D();
      const frente = new Path2D();
      const idx = (i: number, j: number) => i * (LON + 1) + j;
      const seg = (a: number, b: number) => {
        const p = (pz[a] + pz[b]) / 2 < 0 ? fundo : frente;
        p.moveTo(px[a], py[a]);
        p.lineTo(px[b], py[b]);
      };
      for (let i = 0; i <= LAT; i++) for (let j = 0; j < LON; j++) {
        seg(idx(i, j), idx(i, j + 1));
        if (i < LAT) seg(idx(i, j), idx(i + 1, j));
      }
      ctx.lineCap = 'round';
      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 0.7 * dpr;
      ctx.stroke(fundo);
      // Brilho da frente (traço largo e difuso) e depois o traço fino.
      ctx.globalAlpha = 0.16 + 0.3 * ia;
      ctx.lineWidth = 3.4 * dpr;
      ctx.shadowBlur = 12 * dpr;
      ctx.shadowColor = `rgba(${Math.round(120 + 120 * ia)}, 80, 255, 0.9)`;
      ctx.stroke(frente);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 0.95 * dpr;
      ctx.stroke(frente);

      // Pontos nos vértices da frente.
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      const d = 1.5 * dpr;
      for (let v = 0; v < px.length; v++) if (pz[v] > 0.1) ctx.rect(px[v] - d / 2, py[v] - d / 2, d, d);
      ctx.fill();

      // Partículas em volta: giram devagar, piscam, e se aproximam quando a pessoa fala.
      const cosB = Math.cos(ang * 0.35), sinB = Math.sin(ang * 0.35);
      for (const q of particulas) {
        q.ph += q.v * dt;
        const r = q.r - (q.r - 1.08) * 0.55 * pessoa;
        const x = Math.sin(q.th) * Math.cos(q.ph) * r, y = Math.cos(q.th) * r, z = Math.sin(q.th) * Math.sin(q.ph) * r;
        const x1 = x * cosB + z * sinB, z1 = -x * sinB + z * cosB;
        const y2 = y * cosT - z1 * sinT, z2 = y * sinT + z1 * cosT;
        const persp = 1 + 0.16 * z2;
        const pisca = 0.5 + 0.5 * Math.sin(t * 1.8 + q.f);
        ctx.globalAlpha = (0.18 + 0.5 * pisca) * (0.75 + 0.6 * pessoa) * (z2 > 0 ? 1 : 0.55);
        ctx.beginPath();
        ctx.arc(cx + x1 * R * persp, cy - y2 * R * persp, q.s * dpr * (0.9 + 0.5 * pessoa), 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(desenhar);
    };
    raf = requestAnimationFrame(desenhar);
    return () => cancelAnimationFrame(raf);
  }, [tamanho, niveis]);

  return <canvas ref={ref} className="orbe" style={{ width: tamanho, height: tamanho }} aria-hidden="true" data-modo={modo} />;
}
