// =============================================================
// animations.js — tudo que é ligado ao scroll
// -------------------------------------------------------------
// GSAP + ScrollTrigger escrevem valores no `estado` (estado.js); a cena
// redesenha sozinha. Cada seção tem um "preset" completo de estado
// e as transições entre seções interpolam um preset no outro.
// As seções pinadas (vista explodida e funcionamento) usam funções
// de progresso (0..1 → estado), o que deixa o scrub reversível.
//
// gsap.matchMedia() é a forma atual do ScrollTrigger.matchMedia():
// cria versões diferentes para desktop, celular e movimento reduzido
// e desfaz tudo sozinho quando a largura da tela muda.
// =============================================================
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { ESTADO_INICIAL, LATA_Z, BASE_Z, POSES_BRACO, ALCANCE_LATA } from './estado.js';

gsap.registerPlugin(ScrollTrigger);
if (import.meta.env.DEV) window.__ST = ScrollTrigger; // depuração

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const suave = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const faixa = (p, a, b) => clamp01((p - a) / (b - a));
// interpola dois estados completos (todos os campos são números)
const misturar = (de, para, t) => {
  const o = {};
  for (const k in para) o[k] = de[k] + (para[k] - de[k]) * t;
  return o;
};

// Posição do robô quando a lata fica ao alcance do braço
const Z_COLETA = LATA_Z - ALCANCE_LATA;
// Posição final (de costas), com a frente do robô sobre a base
const Z_BASE = BASE_Z + 0.9;

// Trajetória do braço: [progresso da seção, pose]. Entre duas poses o
// movimento é suavizado; a cena converte cada pose em 6 ângulos.
const B = POSES_BRACO;
const ROTEIRO_BRACO = [
  [0.0, B.repouso],
  [0.21, B.repouso], [0.27, B.aproximar],          // estende para medir com o ultrassônico
  [0.4, B.aproximar], [0.45, B.acimaLata],         // posiciona a garra sobre a lata
  [0.49, B.pegar],                                 // desce
  [0.54, B.pegar], [0.6, B.levantar],              // fecha e levanta
  [0.69, B.sobreCaixa],                            // gira a base 180° sobre o compartimento
  [0.75, B.sobreCaixa], [0.8, B.repouso],          // solta e volta a recolher
];
function poseNoRoteiro(p) {
  const k = ROTEIRO_BRACO;
  if (p <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (p <= k[i][0]) return misturar(k[i - 1][1], k[i][1], suave(faixa(p, k[i - 1][0], k[i][0])));
  }
  return k[k.length - 1][1];
}

// ---------- Presets de estado por seção ----------
function presets(celular) {
  const P = (extra) => ({ ...ESTADO_INICIAL, spinMix: 0, follow: 0, ...extra });
  const hero = celular
    ? P({ camX: 4.3, camY: 2.6, camZ: 5.7, lookY: 0.05, shiftY: 0.27, robotRotY: -0.6, spinMix: 1, follow: 1, flip: 0.3 })
    : P({ camX: 2.6, camY: 1.45, camZ: 3.4, lookY: -0.05, shiftX: 0.2, robotRotY: -0.6, spinMix: 1, follow: 1, flip: 0.3 });
  const saida = { ...hero, shiftX: celular ? 1.3 : 1.15, spinMix: 0, follow: 0, flip: 0 };
  const robo = celular
    ? P({ camX: 3.0, camY: 2.5, camZ: 4.0, lookY: 0.15, shiftY: 0.12, robotRotY: 0.5 })
    : P({ camX: 2.6, camY: 1.9, camZ: 3.2, lookY: 0.1, shiftX: 0.2, robotRotY: 0.5 });
  const func = celular
    ? P({ camX: -4.0, camY: 6.6, camZ: -5.4, lookY: -0.1, lookZ: 1.0, shiftY: -0.13, robotRotY: 0, grip: 1, canVis: 1, baseVis: 0 })
    : P({ camX: -4.7, camY: 3.0, camZ: -2.0, lookY: -0.1, lookZ: 1.4, shiftX: 0.24, robotRotY: 0, grip: 1, canVis: 1, baseVis: 0 });
  return { hero, saida, robo, func };
}

// ---------- Vista explodida: progresso → estado ----------
function estadoExplodida(p, base) {
  // 0–0.4 abre · 0.4–0.62 segura (rótulos) · 0.62–1 fecha
  const ex = p < 0.4 ? suave(p / 0.4) : p < 0.62 ? 1 : 1 - suave((p - 0.62) / 0.38);
  return {
    ...base,
    explode: ex,
    labels: clamp01((ex - 0.8) / 0.2),
    robotRotY: base.robotRotY + p * 0.7,
    camY: base.camY * (1 + 0.45 * ex),
    camZ: base.camZ * (1 + 0.5 * ex),
    camX: base.camX * (1 + 0.5 * ex),
    lookY: base.lookY + 0.15 * ex,
  };
}

// ---------- Como funciona: progresso → estado (5 etapas de 0.2) ----------
function estadoFuncionamento(p, base) {
  const e = { ...base, ...poseNoRoteiro(p) };
  // 1) Detectar (0–0.2): caixa YOLO aparece sobre a lata
  e.yolo = faixa(p, 0.03, 0.1) * (1 - faixa(p, 0.42, 0.46));
  // 2) Aproximar (0.2–0.4): braço estende, robô anda, ultrassônico mede
  e.robotZ = suave(faixa(p, 0.24, 0.4)) * Z_COLETA;
  e.sonar = faixa(p, 0.25, 0.28) * (1 - faixa(p, 0.4, 0.43));
  // 3) Coletar (0.4–0.6): garra abre, desce, fecha sobre a lata e levanta
  e.grip = 1 - faixa(p, 0.41, 0.45) + suave(faixa(p, 0.5, 0.54));
  e.carry = suave(faixa(p, 0.52, 0.54));
  // 4) Depositar (0.6–0.8): base do braço gira, garra solta a lata no compartimento
  e.grip -= faixa(p, 0.7, 0.72);
  e.grip += faixa(p, 0.76, 0.8);
  e.canBin = faixa(p, 0.71, 0.75) ** 2; // acelera como queda
  // 5) Retornar (0.8–1): a base aparece, o robô gira 180° e volta
  e.baseVis = faixa(p, 0.8, 0.85);
  e.robotRotY = Math.PI * suave(faixa(p, 0.82, 0.88));
  e.robotZ += (Z_BASE - Z_COLETA) * suave(faixa(p, 0.86, 0.99));
  // câmera acompanha o robô sem perder a lata/base de vista
  e.lookZ = base.lookZ + e.robotZ * 0.55;
  e.camZ = base.camZ + e.robotZ * 0.55;
  return e;
}

/**
 * Inicia Lenis + ScrollTriggers.
 * `estado` = objeto de estado.js · `com3D` = false quando não há WebGL.
 */
export function iniciarAnimacoes({ estado, com3D, slam, reduzido }) {
  // ---------- Rolagem suave (desligada com movimento reduzido) ----------
  let lenis = null;
  if (!reduzido) {
    // syncTouch fica desligado (padrão): no toque a rolagem é a nativa, nada trava
    lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  // Links internos (#secao) passam pelo Lenis quando ele existe
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const alvo = document.querySelector(id);
      if (!alvo) return;
      ev.preventDefault();
      if (lenis) lenis.scrollTo(alvo, { offset: 0 });
      else alvo.scrollIntoView({ behavior: reduzido ? 'auto' : 'smooth' });
      alvo.setAttribute('tabindex', '-1');
      alvo.focus({ preventScroll: true });
    });
  });

  const etapas = [...document.querySelectorAll('.etapa')];
  let etapaAtual = -1;
  function marcarEtapa(i) {
    if (i === etapaAtual) return;
    etapaAtual = i;
    etapas.forEach((el, k) => {
      el.classList.toggle('is-ativa', k === i);
      el.classList.toggle('is-feita', k < i);
      if (k === i) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
    });
  }

  const range = document.getElementById('slam-range');
  range.addEventListener('input', () => slam.render(range.value / 1000));

  // escreve um objeto de estado inteiro na cena
  const aplicar = (obj) => { if (com3D) Object.assign(estado.valores, obj); };

  const mm = gsap.matchMedia();

  mm.add(
    {
      desktop: '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
      celular: '(max-width: 767px) and (prefers-reduced-motion: no-preference)',
      reduzido: '(prefers-reduced-motion: reduce)',
    },
    (ctx) => {
      const { celular, reduzido: rm } = ctx.conditions;
      const pr = presets(celular);

      // ===== MOVIMENTO REDUZIDO: sem pin, sem scrub, troca de estado direta =====
      if (rm) {
        aplicar({ ...pr.hero, spinMix: 0, follow: 0 });
        const quando = (gatilho, fn) => ScrollTrigger.create({
          trigger: gatilho, start: 'top 55%', end: 'bottom 45%',
          onEnter: fn, onEnterBack: fn,
        });
        quando('#inicio', () => aplicar({ ...pr.hero, spinMix: 0, follow: 0 }));
        quando('#problema', () => aplicar(pr.saida));
        quando('#robo', () => aplicar({ ...pr.robo, explode: 1, labels: 1, camX: pr.robo.camX * 1.5, camY: pr.robo.camY * 1.45, camZ: pr.robo.camZ * 1.5, lookY: pr.robo.lookY + 0.15 }));
        const pontos = [0.12, 0.38, 0.58, 0.76, 1];
        etapas.forEach((el, i) => quando(el, () => {
          marcarEtapa(i);
          aplicar(estadoFuncionamento(pontos[i], pr.func));
        }));
        quando('#slam', () => aplicar({ ...pr.func, opacidade: 0 }));
        range.value = 1000;
        slam.render(1);
        return;
      }

      // ----- Trechos do scroll em sequência -----
      // Cada trecho guarda só o PRÓPRIO progresso (0..1, suavizado pelo scrub).
      // O compositor aplica o estado do ÚLTIMO trecho já iniciado; assim um
      // scrub atrasado de uma seção nunca sobrescreve a seção seguinte.
      const trechos = [];
      const compor = () => {
        if (!com3D) return;
        let alvo = pr.hero;
        for (const t of trechos) if (t.p > 0) alvo = t.estado(t.p);
        aplicar(alvo);
      };
      const trecho = (estado, scrollTrigger, extra) => {
        const t = { p: 0, estado };
        trechos.push(t);
        gsap.to(t, {
          p: 1, ease: 'none', scrollTrigger,
          onUpdate: () => { compor(); if (extra) extra(t.p); },
        });
        return t;
      };
      const entre = (de, para) => (p) => misturar(de, para, p);

      aplicar(pr.hero);
      if (com3D) {
        // ===== HERO → PROBLEMA: robô sai de cena =====
        trecho(entre(pr.hero, pr.saida),
          { trigger: '#problema', start: 'top bottom', end: 'top 25%', scrub: 0.6 });
        // ===== ENTRADA DA VISTA EXPLODIDA =====
        trecho(entre(pr.saida, pr.robo),
          { trigger: '#robo', start: 'top bottom', end: 'top top', scrub: 0.6 });
      }
      // ===== VISTA EXPLODIDA (pinada) — sem WebGL não há o que pinar =====
      if (com3D) {
        trecho((p) => estadoExplodida(p, pr.robo), {
          trigger: '#robo', pin: celular ? '.robo__stage' : true,
          start: 'top top', end: celular ? '+=170%' : '+=230%', scrub: 0.6,
        });
        // ===== ENTRADA DO "COMO FUNCIONA" =====
        trecho(entre(estadoExplodida(1, pr.robo), pr.func),
          { trigger: '#funcionamento', start: 'top bottom', end: 'top top', scrub: 0.6 });
        // ===== COMO FUNCIONA (pinada, 4 etapas) =====
        trecho((p) => estadoFuncionamento(p, pr.func), {
          trigger: '#funcionamento', pin: true, start: 'top top',
          end: celular ? '+=330%' : '+=420%', scrub: 0.6,
        }, (p) => marcarEtapa(Math.min(4, Math.floor(p * 5 + 0.0001))));
        // ===== SLAM: a cena 3D some, o mapa 2D assume =====
        const fimFunc = estadoFuncionamento(1, pr.func);
        trecho(entre(fimFunc, { ...fimFunc, opacidade: 0 }),
          { trigger: '#slam', start: 'top bottom', end: 'top 35%', scrub: 0.6 });
      }
      const prog3 = { p: 0 };
      gsap.to(prog3, {
        p: 1, ease: 'none',
        onUpdate: () => {
          slam.render(prog3.p);
          range.value = Math.round(prog3.p * 1000);
        },
        scrollTrigger: celular
          ? { trigger: '.slam__mapa', pin: true, start: 'center center', end: '+=160%', scrub: 0.5 }
          : { trigger: '#slam', pin: true, start: 'top top', end: '+=220%', scrub: 0.5 },
      });

      // ===== Contadores (58 · 96% · 95%) =====
      document.querySelectorAll('.contador').forEach((el) => {
        const alvo = Number(el.dataset.alvo);
        const obj = { v: 0 };
        el.textContent = '0';
        gsap.to(obj, {
          v: alvo, duration: 1.6, ease: 'power2.out',
          onUpdate: () => { el.textContent = Math.round(obj.v); },
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        });
      });

      // ===== Entradas simples de texto =====
      gsap.utils.toArray('.sec-head, .numero, .item, .causa, .impacto article, .tl__item').forEach((el) => {
        gsap.from(el, {
          y: 28, opacity: 0, duration: 0.8, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        });
      });

      return () => { prog3.p = 0; etapaAtual = -1; };
    }
  );

  slam.render(0);
  // Recalcula as posições depois que fontes e layout assentarem
  window.addEventListener('load', () => ScrollTrigger.refresh());
  return { lenis };
}
