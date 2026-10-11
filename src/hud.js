// =============================================================
// hud.js — camada HTML por cima do canvas
// -------------------------------------------------------------
// Rótulos com linha guia da vista explodida, caixa delimitadora
// "estilo YOLO" e leitura do ultrassônico. Tudo é recalculado
// apenas quando a cena renderiza um quadro novo.
// O conteúdo é decorativo (aria-hidden): as mesmas informações
// estão em texto nas seções.
// =============================================================
import * as THREE from 'three';

const ROTULOS = [
  { peca: 'raspberry', n: '01', texto: 'Raspberry Pi 4' },
  { peca: 'camera', n: '02', texto: 'Câmera + YOLO' },
  { peca: 'sensor_ultrassonico', n: '03', texto: 'Sensor ultrassônico' },
  { peca: 'garra', n: '04', texto: 'Braço 6 DOF + garra' },
  { peca: 'compartimento', n: '05', texto: 'Compartimento' },
  { peca: 'esteira_dir', n: '06', texto: 'Esteiras' },
  { peca: 'flipper_fe', n: '07', texto: 'Flippers' },
];

export function criarHUD(cena, { celular }) {
  const svg = document.getElementById('hud-lines');
  const camada = document.getElementById('hud-labels');
  const yolo = document.getElementById('yolo');
  const sonar = document.getElementById('sonar');
  const sonarCm = document.getElementById('sonar-cm');
  const NS = 'http://www.w3.org/2000/svg';

  const itens = ROTULOS.map((r) => {
    const el = document.createElement('div');
    el.className = 'rotulo';
    el.innerHTML = `<span class="rotulo__n mono">${r.n}</span><span class="rotulo__t">${r.texto}</span>`;
    camada.appendChild(el);
    const linha = document.createElementNS(NS, 'polyline');
    const ponto = document.createElementNS(NS, 'circle');
    ponto.setAttribute('r', '3.5');
    svg.append(linha, ponto);
    return { ...r, el, linha, ponto };
  });

  const centro = new THREE.Vector3();
  const v = new THREE.Vector3();
  let modoCompacto = celular;

  function atualizar() {
    const e = cena.estado;
    const w = document.documentElement.clientWidth;
    modoCompacto = window.matchMedia('(max-width: 767px)').matches;

    // ----- rótulos da vista explodida -----
    const op = e.labels;
    svg.style.opacity = op;
    camada.style.opacity = op;
    if (op > 0.01) {
      // centro do robô na tela, usado para empurrar cada rótulo "para fora"
      const c = cena.centroDaPeca('chassi', centro) || centro.set(0, 0, 0);
      const pc = cena.projetar(c);
      for (const it of itens) {
        const a = cena.centroDaPeca(it.peca, v);
        if (!a) { it.el.style.display = 'none'; continue; }
        const p = cena.projetar(a);
        let dx = p.x - pc.x, dy = p.y - pc.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const dist = modoCompacto ? 0 : 46;
        // cotovelo da linha e posição final do texto
        const ex = p.x + dx * dist, ey = p.y + dy * dist;
        const lado = dx >= 0 ? 1 : -1;
        let fx = modoCompacto ? p.x : ex + lado * 28;
        // mantém o rótulo inteiro dentro da tela
        if (!modoCompacto) {
          const larg = it.larg || (it.larg = it.el.offsetWidth || 160); // medido uma vez
          fx = lado > 0 ? Math.min(fx, w - larg - 12) : Math.max(fx, larg + 12);
        }
        if (modoCompacto) it.linha.setAttribute('points', '');
        it.ponto.setAttribute('cx', p.x);
        it.ponto.setAttribute('cy', p.y);
        it.el.style.display = '';
        it.el.classList.toggle('rotulo--esq', lado < 0 && !modoCompacto);
        it.el.classList.toggle('rotulo--compacto', modoCompacto);
        const fy = Math.min(Math.max(modoCompacto ? p.y : ey, 84), window.innerHeight - 24);
        if (!modoCompacto) it.linha.setAttribute('points', `${p.x},${p.y} ${ex},${fy} ${fx},${fy}`);
        it.el.style.transform = `translate(${fx}px, ${fy}px)`;
      }
    }

    // ----- caixa delimitadora (estilo YOLO) -----
    yolo.style.opacity = e.yolo;
    if (e.yolo > 0.01) {
      const r = cena.retanguloLata();
      const pad = 10;
      yolo.style.transform = `translate(${r.x - pad}px, ${r.y - pad}px)`;
      yolo.style.width = `${r.w + pad * 2}px`;
      yolo.style.height = `${r.h + pad * 2}px`;
    }

    // ----- leitura do ultrassônico -----
    sonar.style.opacity = e.sonar;
    if (e.sonar > 0.01) {
      const p = cena.pontoSonar();
      sonar.style.transform = `translate(${p.x}px, ${p.y - 34}px)`;
      sonarCm.textContent = cena.distanciaSonarCm().toFixed(0);
    }
  }

  cena.aoRenderizar(atualizar);
  return { atualizar };
}
