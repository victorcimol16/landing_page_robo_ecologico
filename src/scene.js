// =============================================================
// scene.js — a ÚNICA cena WebGL da página
// -------------------------------------------------------------
// O canvas fica fixo ao fundo (position: fixed). Nada aqui sabe de
// scroll: o arquivo animations.js só escreve valores no objeto
// `estado` e a cena desenha o que estiver lá. Toda vez que um valor
// muda, a cena marca "sujo" e renderiza UM quadro (render sob demanda).
// =============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { criarRoboPlaceholder, completarPecas, CHAO_Y, BRACO } from './placeholder.js';
import { LATA_Z, BASE_Z, ESCALA_M } from './estado.js';

const BASE = import.meta.env.BASE_URL; // funciona em subpasta (GitHub Pages)

// Para onde cada peça vai na vista explodida (deslocamento em unidades do modelo)
const EXPLOSAO = {
  compartimento: [0, 0.75, -0.35],
  plataforma: [0, 0.3, 0],
  raspberry: [0, 0.08, 0],           // fica à mostra quando a placa sobe e as esteiras abrem
  camera: [-0.35, 0.55, 0.05],
  garra: [0, 0.35, 0.75],
  sensor_ultrassonico: [0, 0, 0.14], // no referencial do punho
  esteira_esq: [0.55, 0, 0],
  esteira_dir: [-0.55, 0, 0],
  flipper_fe: [0.75, 0, 0.3],
  flipper_fd: [-0.75, 0, 0.3],
  flipper_te: [0.75, 0, -0.3],
  flipper_td: [-0.75, 0, -0.3],
};

/**
 * @param canvas  o <canvas id="cena">
 * @param estado  objeto de estado.js (as animações escrevem nele)
 */
export function criarCena(canvas, estado, { fraco, celular, reduzido }) {
  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !fraco,      // aparelho fraco: sem antialias
    alpha: true,            // fundo transparente: a grade do CSS aparece por trás
    powerPreference: 'high-performance',
  });
  // Limite de pixel ratio: 2 no desktop, 1.5 no celular
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, celular ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = !fraco;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // WebGL por SOFTWARE (SwiftShader, llvmpipe, "Basic Render Driver"): sem GPU de
  // verdade, cada quadro custa caro na CPU. Nesse caso: sem giro contínuo e pixel ratio 1.
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const nomeGPU = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  const software = /swiftshader|llvmpipe|basic render|software/i.test(nomeGPU);
  if (software) {
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
  }
  const leve = fraco || software;

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);

  // ---------- Luzes (2 em aparelho fraco, 4 nos demais) ----------
  const hemi = new THREE.HemisphereLight(0xdfffee, 0x0e1411, 1.6);
  cena.add(hemi);
  const chave = new THREE.DirectionalLight(0xffffff, 2.4);
  chave.position.set(3, 5, 3);
  cena.add(chave);
  if (!leve) {
    chave.castShadow = true;
    chave.shadow.mapSize.set(1024, 1024);
    Object.assign(chave.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 14 });
    chave.shadow.bias = -0.0005;
    // luz de recorte verde por trás (assinatura visual)
    const recorte = new THREE.DirectionalLight(0x3ddc84, 2.2);
    recorte.position.set(-3, 2, -4);
    cena.add(recorte);
    // luz amarela fraca de preenchimento lateral
    const preench = new THREE.DirectionalLight(0xf5c518, 0.5);
    preench.position.set(-4, 1, 2);
    cena.add(preench);
  }

  // ---------- Chão: grade fina estilo painel ----------
  const grade = new THREE.GridHelper(24, 48, 0x3ddc84, 0x3ddc84);
  grade.material.transparent = true;
  grade.material.opacity = 0.09;
  grade.material.depthWrite = false;
  grade.position.y = CHAO_Y;
  cena.add(grade);
  let sombraChao = null;
  if (!leve) {
    sombraChao = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.ShadowMaterial({ opacity: 0.45 })
    );
    sombraChao.rotation.x = -Math.PI / 2;
    sombraChao.position.y = CHAO_Y + 0.001;
    sombraChao.receiveShadow = true;
    cena.add(sombraChao);
  }

  // ---------- Robô ----------
  // raiz: posição/rotação vindas do scroll. inclina: mouse/giroscópio.
  const raiz = new THREE.Group();
  const inclina = new THREE.Group();
  raiz.add(inclina);
  cena.add(raiz);
  const pecas = {};      // nome → { obj, base: Vector3, desloc: Vector3 }
  let dedos = [];
  const juntas = [];           // juntas[1..6] do braço
  let centroLata = null;       // ponto entre os dedos onde a lata fica presa
  let fundoCaixa = null;       // ponto de repouso dentro do compartimento
  let flippers = [];

  // ---------- Lata, base e linha do sensor (demonstração "como funciona") ----------
  const lata = new THREE.Group();
  {
    const corpo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.138, 0.138, 0.46, 32),
      new THREE.MeshStandardMaterial({ color: 0xc8202b, roughness: 0.35, metalness: 0.6 })
    );
    const topo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.128, 0.138, 0.03, 32),
      new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.3, metalness: 0.9 })
    );
    topo.position.y = 0.245;
    const fundo = topo.clone(); fundo.position.y = -0.245; fundo.rotation.x = Math.PI;
    corpo.castShadow = !leve;
    lata.add(corpo, topo, fundo);
  }
  lata.visible = false;
  cena.add(lata);

  const base = new THREE.Group();
  {
    const anel = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.5, 48),
      new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, side: THREE.DoubleSide })
    );
    anel.rotation.x = -Math.PI / 2;
    const disco = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 48),
      new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.12 })
    );
    disco.rotation.x = -Math.PI / 2;
    base.add(anel, disco);
    base.position.set(0, CHAO_Y + 0.004, BASE_Z);
  }
  base.visible = false;
  cena.add(base);

  const linhaSonar = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: 0xf5c518, dashSize: 0.05, gapSize: 0.035, transparent: true })
  );
  linhaSonar.visible = false;
  cena.add(linhaSonar);

  // ---------- Estado: qualquer mudança marca "sujo" e agenda um quadro ----------
  let sujo = true;
  const bruto = estado.bruto;
  estado.aoMudar(() => { sujo = true; agendar(); });

  // ---------- Carregamento do modelo ----------
  function prepararModelo(modelo) {
    // Centraliza materiais/sombras e cataloga as peças pelo nome
    modelo.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = !leve;
        o.receiveShadow = false;
        if (o.material && o.material.isMeshStandardMaterial) {
          o.material.envMapIntensity = 0;
        }
      }
    });
    inclina.add(modelo);
    for (const nome of [...Object.keys(EXPLOSAO), 'chassi']) {
      const obj = modelo.getObjectByName(nome);
      if (!obj) continue;
      pecas[nome] = {
        obj,
        base: obj.position.clone(),
        desloc: new THREE.Vector3(...(EXPLOSAO[nome] || [0, 0, 0])),
      };
    }
    dedos = ['garra_dedo_e', 'garra_dedo_d'].map((n) => modelo.getObjectByName(n)).filter(Boolean);
    for (let i = 1; i <= 6; i++) juntas[i] = modelo.getObjectByName(`braco_j${i}`) || null;
    centroLata = modelo.getObjectByName('garra_centro_lata');
    fundoCaixa = modelo.getObjectByName('compartimento_fundo');
    flippers = ['flipper_fe', 'flipper_fd', 'flipper_te', 'flipper_td']
      .map((n) => modelo.getObjectByName(n)).filter(Boolean);
    sujo = true;
  }

  // Compila os shaders sem travar a página (KHR_parallel_shader_compile quando existe)
  async function compilar() {
    lata.visible = base.visible = true; // compila também os materiais da demonstração
    try { await renderer.compileAsync(cena, camera); } catch { /* navegador antigo: compila no 1º quadro */ }
    lata.visible = base.visible = false;
    sujo = true;
  }

  /**
   * Carrega /models/robo.glb (Draco). Se não existir, usa o placeholder.
   * onProgresso(0..1, texto) alimenta a barra de carregamento real.
   */
  function carregarModelo(onProgresso) {
    return new Promise((resolve) => {
      const manager = new THREE.LoadingManager();
      let fracaoBytes = 0;
      manager.onProgress = (url, carregados, total) => {
        // itens: o .glb + o decodificador Draco (js + wasm)
        onProgresso(Math.min(0.98, fracaoBytes * 0.85 + (carregados / total) * 0.15), 'decodificando malhas');
      };
      const draco = new DRACOLoader(manager);
      draco.setDecoderPath(`${BASE}draco/`);
      const loader = new GLTFLoader(manager);
      loader.setDRACOLoader(draco);

      loader.load(
        `${BASE}models/robo.glb`,
        async (gltf) => {
          const criadas = completarPecas(gltf.scene);
          prepararModelo(gltf.scene);
          draco.dispose();
          onProgresso(0.99, 'compilando shaders');
          await compilar();
          onProgresso(1, 'pronto');
          resolve({ origem: 'glb', criadas });
        },
        (ev) => {
          if (ev.lengthComputable) {
            fracaoBytes = ev.loaded / ev.total;
            onProgresso(fracaoBytes * 0.85, 'carregando modelo 3D');
          }
        },
        () => {
          // Sem arquivo (ou falhou): robô procedural com os mesmos nomes
          console.info('[cena] robo.glb não encontrado, usando placeholder procedural');
          prepararModelo(criarRoboPlaceholder());
          compilar().then(() => {
            onProgresso(1, 'modelo provisório');
            resolve({ origem: 'placeholder', criadas: [] });
          });
        }
      );
    });
  }

  // ---------- Mouse / giroscópio ----------
  const alvoInclina = new THREE.Vector2();
  const inclinaAtual = new THREE.Vector2();
  function apontar(nx, ny) {
    // nx, ny em -1..1
    alvoInclina.set(THREE.MathUtils.clamp(nx, -1, 1), THREE.MathUtils.clamp(ny, -1, 1));
  }

  // ---------- Redimensionamento ----------
  let largura = 0, altura = 0;
  function redimensionar() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    // No celular a barra de endereço muda a altura ao rolar: ignora variações pequenas
    if (w === largura && Math.abs(h - altura) < 120) return;
    largura = w; altura = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Lente um pouco mais aberta em telas em pé
    camera.fov = w < h ? 40 : 32;
    sujo = true;
  }
  window.addEventListener('resize', redimensionar);

  // ---------- Aplica o estado nos objetos 3D ----------
  const tmp = new THREE.Vector3();
  const pontoGarra = new THREE.Vector3();
  let giro = 0;

  function aplicar() {
    const e = bruto;
    // tablets/notebooks estreitos: afasta a câmera para o robô não cobrir o texto
    const k = largura >= 1100 || largura < 768 ? 1 : 1.3;
    camera.position.set(
      e.lookX + (e.camX - e.lookX) * k,
      e.lookY + (e.camY - e.lookY) * k,
      e.lookZ + (e.camZ - e.lookZ) * k
    );
    camera.lookAt(e.lookX, e.lookY, e.lookZ);
    // setViewOffset desloca o enquadramento sem distorcer a perspectiva
    camera.setViewOffset(largura, altura, -e.shiftX * largura, -e.shiftY * altura, largura, altura);
    camera.updateProjectionMatrix();

    // rotação: valor do scroll + giro automático (o giro some quando spinMix → 0)
    const giroCurto = Math.atan2(Math.sin(giro), Math.cos(giro)); // −π..π: volta pelo lado mais curto
    raiz.position.set(e.robotX, 0, e.robotZ);
    raiz.rotation.y = e.robotRotY + giroCurto * e.spinMix;
    inclina.rotation.set(inclinaAtual.y * 0.18 * e.follow, inclinaAtual.x * 0.35 * e.follow, 0);

    // vista explodida
    const ex = e.explode;
    for (const nome in pecas) {
      const p = pecas[nome];
      p.obj.position.copy(p.base).addScaledVector(p.desloc, ex);
    }
    // flippers giram no próprio eixo (frente sobe com +, trás com −)
    for (const f of flippers) {
      const tras = f.name.endsWith('te') || f.name.endsWith('td');
      f.rotation.x = (tras ? 1 : -1) * e.flip;
    }
    // braço 6 DOF (cinemática inversa) e dedos da garra (aberto = 0.45 rad para fora)
    poseBraco(e);
    for (const d of dedos) {
      const lado = d.name.endsWith('_e') ? 1 : -1;
      d.rotation.z = -lado * (1 - e.grip) * 0.45;
    }

    // lata: no chão → presa na garra (carry) → dentro do compartimento (canBin)
    lata.visible = e.canVis > 0.01;
    base.visible = e.baseVis > 0.01;
    if (lata.visible || e.sonar > 0.01) {
      raiz.updateMatrixWorld(true);
      tmp.set(0, CHAO_Y + 0.24, LATA_Z);
      if (centroLata) centroLata.getWorldPosition(pontoGarra); else pontoGarra.copy(tmp);
      lata.position.lerpVectors(tmp, pontoGarra, e.carry);
      if (e.canBin > 0 && fundoCaixa) {
        fundoCaixa.getWorldPosition(pontoGarra);
        lata.position.lerp(pontoGarra, e.canBin);
      }
      lata.scale.setScalar(Math.max(0.001, e.canVis));
    }
    base.children.forEach((m) => { m.material.opacity = (m.geometry.type === 'RingGeometry' ? 0.9 : 0.12) * e.baseVis; });

    // linha tracejada do ultrassônico até a lata
    linhaSonar.visible = e.sonar > 0.01 && !!pecas.sensor_ultrassonico;
    if (linhaSonar.visible) {
      const s = pecas.sensor_ultrassonico.obj;
      s.getWorldPosition(tmp);
      const pos = linhaSonar.geometry.attributes.position;
      pos.setXYZ(0, tmp.x, tmp.y, tmp.z + 0.05);
      pos.setXYZ(1, lata.position.x, tmp.y, lata.position.z - 0.138);
      pos.needsUpdate = true;
      linhaSonar.computeLineDistances();
      linhaSonar.material.opacity = e.sonar;
    }

    canvas.style.opacity = e.opacidade;
  }

  /**
   * Cinemática inversa do braço: recebe o alvo (giro da base, distância,
   * altura e ângulo da garra) e calcula os ângulos de ombro, cotovelo e
   * punho num plano vertical — solução "cotovelo para cima".
   * J4 fica em 0 (mantém o plano); J6 gira a garra no próprio eixo.
   */
  function poseBraco(e) {
    if (!juntas[2] || !juntas[3] || !juntas[5]) return; // modelo sem as juntas: nada a fazer
    const { L1, L2, GP, OMBRO_Y } = BRACO;
    // punho = ponto de pega recuado GP na direção da garra
    const wz = e.armR - GP * Math.sin(e.armPsi);
    const wy = e.armH - GP * Math.cos(e.armPsi) - OMBRO_Y;
    const D = THREE.MathUtils.clamp(Math.hypot(wz, wy), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
    const dir = Math.atan2(wz, wy); // ângulo a partir da vertical, positivo para a frente
    const a = Math.acos(THREE.MathUtils.clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    const g = Math.acos(THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
    const ombro = dir - a;               // braço superior (absoluto)
    const antebraco = ombro + (Math.PI - g);
    if (juntas[1]) juntas[1].rotation.y = e.armYaw;
    juntas[2].rotation.x = ombro;
    juntas[3].rotation.x = antebraco - ombro;
    if (juntas[4]) juntas[4].rotation.y = 0;
    juntas[5].rotation.x = e.armPsi - antebraco;
    if (juntas[6]) juntas[6].rotation.y = e.armRoll;
  }

  /** Distância (cm) entre o sensor e a superfície da lata, medida na cena 3D. */
  function distanciaSonarCm() {
    const s = pecas.sensor_ultrassonico?.obj;
    if (!s) return 0;
    s.getWorldPosition(tmp);
    const d = Math.max(0, lata.position.z - 0.138 - (tmp.z + 0.05));
    return (d / ESCALA_M) * 100;
  }

  // ---------- Projeção 3D → tela (para rótulos HTML) ----------
  const caixaTmp = new THREE.Box3();
  function projetar(vetor) {
    tmp.copy(vetor).project(camera);
    return {
      x: (tmp.x * 0.5 + 0.5) * largura,
      y: (-tmp.y * 0.5 + 0.5) * altura,
      dentro: tmp.z < 1,
    };
  }
  function centroDaPeca(nome, alvo = new THREE.Vector3()) {
    const p = pecas[nome];
    if (!p) return null;
    caixaTmp.setFromObject(p.obj);
    return caixaTmp.getCenter(alvo);
  }
  /** Retângulo na tela que envolve a lata (para a caixa estilo YOLO). */
  function retanguloLata() {
    caixaTmp.setFromObject(lata);
    const c = [caixaTmp.min, caixaTmp.max];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      tmp.set(c[i & 1].x, c[(i >> 1) & 1].y, c[(i >> 2) & 1].z).project(camera);
      const sx = (tmp.x * 0.5 + 0.5) * largura, sy = (-tmp.y * 0.5 + 0.5) * altura;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function pontoSonar() {
    const pos = linhaSonar.geometry.attributes.position;
    tmp.set((pos.getX(0) + pos.getX(1)) / 2, pos.getY(0), (pos.getZ(0) + pos.getZ(1)) / 2);
    return projetar(tmp);
  }

  // ---------- Laço de renderização sob demanda ----------
  let ativo = !document.hidden;
  let rodando = false;
  let ultimo = performance.now();
  const aoRenderizar = [];

  function quadro(agora) {
    rodando = false;
    if (!ativo) return;
    const dt = Math.min(0.05, (agora - ultimo) / 1000);
    ultimo = agora;

    let animando = false;
    // giro automático do hero
    if (!reduzido && !software && bruto.spinMix > 0.001 && bruto.opacidade > 0.01) {
      giro += dt * 0.35;
      sujo = true;
      animando = true;
    }
    // suavização do mouse/giroscópio
    if (bruto.follow > 0.001) {
      const antes = inclinaAtual.clone();
      inclinaAtual.lerp(alvoInclina, 1 - Math.pow(0.002, dt));
      if (antes.distanceToSquared(inclinaAtual) > 1e-7) { sujo = true; animando = true; }
    }

    if (sujo && bruto.opacidade > 0.001) {
      sujo = false;
      aplicar();
      renderer.render(cena, camera);
      for (const cb of aoRenderizar) cb();
    } else if (sujo) {
      // canvas invisível: só aplica a opacidade, sem gastar GPU
      sujo = false;
      canvas.style.opacity = 0;
      for (const cb of aoRenderizar) cb();
    }
    // Só pede o próximo quadro se algo está animando; senão espera invalidar()
    if (animando) agendar();
  }
  function agendar() {
    if (!rodando && ativo) {
      rodando = true;
      requestAnimationFrame(quadro);
    }
  }
  function invalidar() { sujo = true; agendar(); }

  // Pausa total com a aba oculta
  document.addEventListener('visibilitychange', () => {
    ativo = !document.hidden;
    if (ativo) { ultimo = performance.now(); invalidar(); }
  });

  redimensionar();
  invalidar();

  return {
    estado: estado.valores,
    carregarModelo,
    apontar: (nx, ny) => { apontar(nx, ny); agendar(); },
    invalidar,
    software,
    redimensionar: () => { largura = 0; redimensionar(); invalidar(); },
    aoRenderizar: (cb) => aoRenderizar.push(cb),
    projetar,
    centroDaPeca,
    retanguloLata,
    pontoSonar,
    distanciaSonarCm,
  };
}
