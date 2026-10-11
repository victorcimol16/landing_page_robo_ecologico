// =============================================================
// slam.js — simulação 2D (vista de cima) do mapeamento SLAM
// -------------------------------------------------------------
// Canvas 2D comum (não é WebGL, então a página continua com um
// único contexto WebGL). O corredor é uma grade de células.
// Um "lidar" simulado lança raios a partir do robô; cada célula
// atingida passa a ser conhecida no mapa.
//
// Para o scrub funcionar nos dois sentidos, tudo é pré-calculado:
// para cada célula guardamos o PRIMEIRO instante em que ela foi
// vista. Desenhar o progresso p é só comparar esse instante com p.
// Isto é uma ilustração do conceito, não o algoritmo real do robô.
// =============================================================

const COLS = 36, ROWS = 22, CEL = 20;           // 720 × 440 px lógicos
const ALCANCE = 7, RAIOS = 120;                 // alcance do sensor em células

const cor = {
  fundo: '#0b110e', grade: 'rgba(61,220,132,0.06)',
  livre: 'rgba(61,220,132,0.14)', ocupado: '#3DDC84',
  novo: '#F5C518', fantasma: 'rgba(230,240,235,0.32)',
  rastro1: 'rgba(230,240,235,0.75)', rastro2: '#F5C518', texto: 'rgba(230,240,235,0.7)',
};

// ---------- Mundo real (o que o robô ainda não sabe) ----------
function mundoBase() {
  const m = new Uint8Array(COLS * ROWS);
  const parede = (c0, r0, c1, r1) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) m[r * COLS + c] = 1;
  };
  parede(0, 0, COLS - 1, 0); parede(0, ROWS - 1, COLS - 1, ROWS - 1);
  parede(0, 0, 0, ROWS - 1); parede(COLS - 1, 0, COLS - 1, ROWS - 1);
  // paredes das salas com portas
  parede(1, 3, COLS - 2, 3); parede(1, 18, COLS - 2, 18);
  for (const c of [6, 7, 18, 19, 29, 30]) m[3 * COLS + c] = 0;
  for (const c of [11, 12, 24, 25]) m[18 * COLS + c] = 0;
  // divisórias entre salas
  for (const c of [12, 24]) parede(c, 1, c, 2);
  for (const c of [18, 30]) parede(c, 19, c, 20);
  // banco fixo, pilar e lixeira
  parede(9, 5, 13, 6);
  parede(20, 4, 20, 4);
  parede(22, 15, 23, 16);
  return m;
}
const MESA1 = [16, 9, 18, 11];   // c0, r0, c1, r1 — posição antes
const MESA2 = [24, 6, 26, 8];    // posição depois (o obstáculo "mudou de lugar")
const MOVEIS = [
  { r: [9, 5, 13, 6], nome: 'banco' },
  { r: [22, 15, 23, 16], nome: 'lixeira' },
];

function comMesa(m, [c0, r0, c1, r1]) {
  const n = m.slice();
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) n[r * COLS + c] = 1;
  return n;
}

// ---------- Trajetos (em coordenadas de célula) ----------
const P1 = [[2.5, 10.5], [13.5, 10.5], [15, 14], [20, 14], [24.5, 11.5], [33, 11.5], [33, 6.5]];
const P2 = [[33, 6.5], [28.5, 10.5], [17, 10.5], [8, 10.5], [2.5, 10.5]];

function amostrar(caminho, passo = 0.25) {
  const pts = [];
  for (let i = 0; i < caminho.length - 1; i++) {
    const [x0, y0] = caminho[i], [x1, y1] = caminho[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / passo));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, a: Math.atan2(y1 - y0, x1 - x0) });
    }
  }
  const [xf, yf] = caminho[caminho.length - 1];
  pts.push({ x: xf, y: yf, a: pts[pts.length - 1].a });
  return pts;
}

/** Para cada célula: índice da primeira amostra em que ela foi vista (-1 = nunca). */
function varrer(mundo, amostras) {
  const visto = new Int32Array(COLS * ROWS).fill(-1);
  amostras.forEach((p, i) => {
    for (let k = 0; k < RAIOS; k++) {
      const ang = (k / RAIOS) * Math.PI * 2;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      for (let d = 0; d <= ALCANCE; d += 0.3) {
        const c = Math.floor(p.x + dx * d), r = Math.floor(p.y + dy * d);
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) break;
        const idx = r * COLS + c;
        if (visto[idx] < 0) visto[idx] = i;
        if (mundo[idx]) break; // raio bateu em obstáculo
      }
    }
  });
  return visto;
}

export function criarSlam(canvas, faseEl) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = COLS * CEL * dpr;
  canvas.height = ROWS * CEL * dpr;
  ctx.scale(dpr, dpr);

  // O pré-cálculo dos raios só roda quando a seção se aproxima da tela,
  // para não pesar no carregamento inicial da página.
  let mundo1, mundo2, am1, am2, visto1, visto2;
  let pronto = false;
  let pendente = 0;
  function preparar() {
    const base = mundoBase();
    mundo1 = comMesa(base, MESA1);
    mundo2 = comMesa(base, MESA2);
    am1 = amostrar(P1); am2 = amostrar(P2);
    visto1 = varrer(mundo1, am1);
    visto2 = varrer(mundo2, am2);
    pronto = true;
    render(pendente);
  }
  const obs = new IntersectionObserver((ents) => {
    if (!ents.some((e) => e.isIntersecting)) return;
    obs.disconnect();
    (window.requestIdleCallback || setTimeout)(preparar);
  }, { rootMargin: '1200px 0px' });
  obs.observe(canvas);

  let ultimoP = -1;
  let ultimaFase = '';

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (t) => Math.min(1, Math.max(0, t));

  function retFantasma([c0, r0, c1, r1], rotulo) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = cor.fantasma;
    ctx.strokeRect(c0 * CEL + 1, r0 * CEL + 1, (c1 - c0 + 1) * CEL - 2, (r1 - r0 + 1) * CEL - 2);
    ctx.setLineDash([]);
    ctx.fillStyle = cor.texto;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillText(rotulo, c0 * CEL + 3, r0 * CEL - 4);
    ctx.restore();
  }

  function desenharRastro(amostras, ate, estilo) {
    if (ate < 1) return;
    ctx.strokeStyle = estilo;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(amostras[0].x * CEL, amostras[0].y * CEL);
    for (let i = 1; i <= ate; i++) ctx.lineTo(amostras[i].x * CEL, amostras[i].y * CEL);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  /** Desenha o estado da simulação no progresso p (0..1). */
  function render(p) {
    p = clamp01(p);
    if (!pronto) { pendente = p; return; }
    if (Math.abs(p - ultimoP) < 0.0005) return;
    ultimoP = p;

    // Linha do tempo: 0–0.48 fase 1 · 0.48–0.56 obstáculo muda · 0.56–1 fase 2
    const t1 = clamp01(p / 0.48);
    const tm = clamp01((p - 0.48) / 0.08);
    const t2 = clamp01((p - 0.56) / 0.44);
    const i1 = Math.round(t1 * (am1.length - 1));
    const i2 = p >= 0.56 ? Math.round(t2 * (am2.length - 1)) : -1;

    ctx.fillStyle = cor.fundo;
    ctx.fillRect(0, 0, COLS * CEL, ROWS * CEL);

    // células conhecidas
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const k = r * COLS + c;
        const viu1 = visto1[k] >= 0 && visto1[k] <= i1;
        const viu2 = i2 >= 0 && visto2[k] >= 0 && visto2[k] <= i2;
        if (!viu1 && !viu2) continue;
        const ocupado = viu2 ? mundo2[k] : mundo1[k];
        const mudou = viu2 && viu1 && mundo1[k] !== mundo2[k];
        const x = c * CEL, y = r * CEL;
        if (mudou) {
          ctx.fillStyle = ocupado ? cor.novo : 'rgba(245,197,24,0.18)';
          ctx.fillRect(x + 1, y + 1, CEL - 2, CEL - 2);
          if (!ocupado) { ctx.strokeStyle = cor.novo; ctx.strokeRect(x + 1.5, y + 1.5, CEL - 3, CEL - 3); }
        } else {
          ctx.fillStyle = ocupado ? cor.ocupado : cor.livre;
          ctx.fillRect(x + 1, y + 1, CEL - 2, CEL - 2);
        }
      }
    }

    // grade fina por cima
    ctx.strokeStyle = cor.grade;
    ctx.beginPath();
    for (let c = 0; c <= COLS; c++) { ctx.moveTo(c * CEL + 0.5, 0); ctx.lineTo(c * CEL + 0.5, ROWS * CEL); }
    for (let r = 0; r <= ROWS; r++) { ctx.moveTo(0, r * CEL + 0.5); ctx.lineTo(COLS * CEL, r * CEL + 0.5); }
    ctx.stroke();

    // móveis reais em tracejado (o "mundo", que o mapa vai descobrindo)
    for (const m of MOVEIS) retFantasma(m.r, m.nome);
    const mesa = MESA1.map((v, i) => lerp(v, MESA2[i], tm));
    retFantasma(mesa, tm > 0 && tm < 1 ? 'mesa (movendo)' : 'mesa');

    // base de recarga/descarte
    ctx.strokeStyle = cor.ocupado;
    ctx.strokeRect(1.2 * CEL, 9.3 * CEL, 2.6 * CEL, 2.4 * CEL);
    ctx.fillStyle = cor.ocupado;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillText('BASE', 1.4 * CEL, 12.4 * CEL);

    // rastros
    desenharRastro(am1, i1, cor.rastro1);
    if (i2 >= 0) desenharRastro(am2, i2, cor.rastro2);

    // robô + alcance do sensor
    const pos = i2 >= 0 ? am2[i2] : am1[i1];
    const rx = pos.x * CEL, ry = pos.y * CEL;
    ctx.strokeStyle = 'rgba(61,220,132,0.22)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.arc(rx, ry, ALCANCE * CEL, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#0e1411';
    ctx.strokeStyle = '#e6f0eb';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(rx, ry, CEL * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.cos(pos.a) * CEL * 0.9, ry + Math.sin(pos.a) * CEL * 0.9); ctx.stroke();
    ctx.lineWidth = 1;

    // texto da fase (só troca quando muda, para o aria-live não repetir)
    const fase = p < 0.48 ? 'fase 1 · explorando o corredor e construindo o mapa'
      : p < 0.56 ? 'atenção · a mesa mudou de lugar'
      : 'fase 2 · mapa atualizado, rota de volta recalculada';
    if (fase !== ultimaFase) { ultimaFase = fase; faseEl.textContent = fase; }
  }

  return { render };
}
