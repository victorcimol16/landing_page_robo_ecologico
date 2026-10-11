// =============================================================
// main.js — ponto de entrada
// -------------------------------------------------------------
// 1. Detecta capacidade do aparelho e preferências de movimento
// 2. Inicia as animações de scroll (leves, sem Three.js)
// 3. Carrega a cena 3D SOB DEMANDA (import dinâmico) depois da
//    primeira pintura — o texto aparece rápido e o 3D chega em seguida
// 4. Liga a tela de carregamento ao progresso real do modelo
// 5. Mouse/giroscópio e QR code
// =============================================================
import './styles.css';
import { criarEstado } from './estado.js';
import { criarSlam } from './slam.js';
import { iniciarAnimacoes } from './animations.js';
import { marcarFeintec } from './feintec.js';

marcarFeintec(); // "acontecendo agora" de 3 a 5/11/2026

const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const celular = window.matchMedia('(max-width: 767px)').matches; // mesmo critério do CSS
// Aparelho "fraco": poucos núcleos ou tela pequena → sem sombras, sem antialias, 2 luzes
const fraco = (navigator.hardwareConcurrency || 4) <= 4 || celular;

document.documentElement.classList.toggle('rm', reduzido);

/** Testa se o navegador consegue criar um contexto WebGL. */
function temWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

// ---------- Tela de carregamento ----------
const loader = document.getElementById('loader');
const fill = document.getElementById('loader-fill');
const pct = document.getElementById('loader-pct');
const rotuloLoader = document.getElementById('loader-label');

function progresso(f, texto) {
  fill.style.transform = `scaleX(${f})`;
  pct.textContent = `${Math.round(f * 100)}%`;
  if (texto) rotuloLoader.textContent = texto;
}
function esconderLoader() {
  if (!loader.isConnected) return;
  document.body.classList.remove('is-loading');
  loader.classList.add('is-done');
  setTimeout(() => loader.remove(), 700);
}
// Segurança: se algo travar, o conteúdo nunca fica escondido atrás do loader
setTimeout(esconderLoader, 12000);

// ---------- Estado compartilhado + animações de scroll ----------
const com3D = temWebGL();
const estado = criarEstado();
const slam = criarSlam(document.getElementById('slam-canvas'), document.getElementById('slam-fase'));
const { lenis } = iniciarAnimacoes({ estado, com3D, slam, reduzido });
if (import.meta.env.DEV) window.__lenis = lenis; // depuração

// ---------- Cena 3D (carregada sob demanda) ou fallback ----------
const canvas = document.getElementById('cena');

function semWebGL() {
  canvas.remove();
  document.getElementById('hud').remove();
  document.getElementById('sem-webgl').hidden = false;
  document.documentElement.classList.add('sem-webgl-on');
  progresso(1, 'sem WebGL');
  esconderLoader();
}

async function iniciar3D() {
  progresso(0.02, 'carregando motor 3D');
  try {
    // Three.js, loaders e HUD ficam num pedaço separado do bundle
    const [{ criarCena }, { criarHUD }] = await Promise.all([import('./scene.js'), import('./hud.js')]);
    const cena = criarCena(canvas, estado, { fraco, celular, reduzido });
    if (import.meta.env.DEV) window.__cena = cena; // só para depuração no navegador
    criarHUD(cena, { celular });
    ligarPonteiro(cena);
    const { origem, criadas } = await cena.carregarModelo(progresso);
    if (origem === 'glb' && criadas.length) {
      console.info('[main] peças procedurais adicionadas ao modelo:', criadas.join(', '));
    }
    esconderLoader();
  } catch (err) {
    console.warn('[main] falha ao iniciar o 3D', err);
    semWebGL();
  }
}

if (!com3D) {
  semWebGL();
} else {
  // espera a página carregar (texto já pintado) antes de baixar/compilar o 3D
  const depois = () => (window.requestIdleCallback || ((f) => setTimeout(f, 1)))(iniciar3D, { timeout: 1200 });
  if (document.readyState === 'complete') depois();
  else window.addEventListener('load', depois, { once: true });
}

// ---------- Mouse (desktop) e giroscópio (celular, só com permissão) ----------
function ligarPonteiro(cena) {
  if (reduzido) return;
  if (window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      cena.apontar((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });
    return;
  }
  if (!('DeviceOrientationEvent' in window)) return;
  const btn = document.getElementById('btn-giro');
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    try {
      // iOS exige pedido explícito de permissão a partir de um toque
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { btn.textContent = 'Permissão negada: rotação automática'; return; }
      }
      window.addEventListener('deviceorientation', (ev) => {
        if (ev.gamma == null) return;
        cena.apontar(ev.gamma / 30, (ev.beta - 45) / 30);
      }, { passive: true });
      btn.textContent = 'Giroscópio ativo';
      btn.disabled = true;
    } catch {
      btn.textContent = 'Giroscópio indisponível';
    }
  });
}

// ---------- QR code (carregado só quando o rodapé se aproxima) ----------
const qrEl = document.getElementById('qr');
const obs = new IntersectionObserver(async (entradas) => {
  if (!entradas.some((e) => e.isIntersecting)) return;
  obs.disconnect();
  const { default: qrcode } = await import('qrcode-generator');
  const url = window.location.href.split('#')[0];
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  qrEl.setAttribute('aria-label', `QR code com o endereço desta página: ${url}`);
}, { rootMargin: '600px' });
obs.observe(qrEl);
