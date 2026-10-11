// =============================================================
// placeholder.js — peças procedurais (caixas e cilindros)
// -------------------------------------------------------------
// Usado em dois casos:
//  1) /models/robo.glb não existe → monta o robô inteiro aqui;
//  2) o .glb existe mas ainda não tem alguma peça (ex.: o CAD atual
//     não tem o braço com garra, o compartimento, a câmera, o sensor
//     nem o Raspberry Pi) → só as peças que faltam são criadas.
// Unidades: o modelo é normalizado para ~2 unidades de comprimento
// (frente do robô = +Z, topo = +Y, chão em y ≈ -0.335).
// =============================================================
import * as THREE from 'three';

// Todas as peças que a página procura pelo nome
export const PECAS = [
  'esteira_esq', 'esteira_dir',
  'flipper_fe', 'flipper_fd', 'flipper_te', 'flipper_td',
  'plataforma', 'garra', 'compartimento', 'raspberry', 'sensor_ultrassonico', 'camera',
];

// Topo da placa de montagem (onde braço, câmera e compartimento se apoiam)
export const PLACA_Y = 0.1;

// Medidas do braço 6 DOF (usadas também pela cinemática inversa em scene.js)
export const BRACO = {
  L1: 0.55,        // ombro → cotovelo
  L2: 0.48,        // cotovelo → punho
  GP: 0.24,        // punho → ponto de pega (centro entre os dedos)
  OMBRO_Y: 0.16,   // altura do ombro acima da base do braço
};

export const CHAO_Y = -0.335;

// Materiais simples e reaproveitados (menos trocas de estado na GPU)
const mat = {
  esteira: new THREE.MeshStandardMaterial({ color: 0x2b2e2c, roughness: 0.85 }),
  placa: new THREE.MeshStandardMaterial({ color: 0x8d0905, roughness: 0.6 }),
  chassi: new THREE.MeshStandardMaterial({ color: 0x3a403d, roughness: 0.7, metalness: 0.2 }),
  acrilico: new THREE.MeshStandardMaterial({ color: 0x3b3fa0, roughness: 0.4 }),
  pcb: new THREE.MeshStandardMaterial({ color: 0x1f7a3d, roughness: 0.55 }),
  pcbAzul: new THREE.MeshStandardMaterial({ color: 0x1d4f9c, roughness: 0.55 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.35, metalness: 0.8 }),
  preto: new THREE.MeshStandardMaterial({ color: 0x111312, roughness: 0.5 }),
  lente: new THREE.MeshStandardMaterial({ color: 0x0a1a12, roughness: 0.1, metalness: 0.6 }),
  // A garra usa o amarelo de alerta da identidade visual
  garra: new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.5, metalness: 0.1 }),
  junta: new THREE.MeshStandardMaterial({ color: 0x1b211e, roughness: 0.45, metalness: 0.4 }),
  // compartimento em acrílico verde translúcido (dá para ver o resíduo dentro)
  acrilicoVerde: new THREE.MeshStandardMaterial({
    color: 0x3ddc84, roughness: 0.2, transparent: true, opacity: 0.32, depthWrite: false,
  }),
  quadro: new THREE.MeshStandardMaterial({ color: 0x1f5c3a, roughness: 0.5 }),
};

const caixa = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cilindro = (r, h, m, seg = 20) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);

// ---------- Peças do chassi (só usadas se o .glb não carregar) ----------

function esteira(nome, x) {
  const g = new THREE.Group();
  g.name = nome;
  g.position.set(x, -0.117, 0);
  const comp = 0.64, r = 0.2;
  const meio = caixa(0.2, r * 2, comp, mat.esteira);
  const rodaA = cilindro(r, 0.2, mat.esteira); rodaA.rotation.z = Math.PI / 2; rodaA.position.z = comp / 2;
  const rodaB = rodaA.clone(); rodaB.position.z = -comp / 2;
  const tampa = caixa(0.02, r * 1.3, comp, mat.placa); tampa.position.x = Math.sign(x) * 0.11;
  g.add(meio, rodaA, rodaB, tampa);
  return g;
}

function flipper(nome, x, z) {
  // O grupo fica no EIXO do flipper; a peça se estende para fora (frente ou trás)
  const g = new THREE.Group();
  g.name = nome;
  g.position.set(x, -0.117, z);
  const sentido = Math.sign(z);
  const comp = 0.68;
  const corpo = caixa(0.1, 0.3, comp, mat.esteira); corpo.position.z = sentido * comp / 2;
  const ponta = cilindro(0.1, 0.1, mat.esteira); ponta.rotation.z = Math.PI / 2; ponta.position.z = sentido * comp;
  const eixo = cilindro(0.15, 0.1, mat.esteira); eixo.rotation.z = Math.PI / 2;
  const placa = caixa(0.02, 0.22, comp * 0.9, mat.placa);
  placa.position.set(Math.sign(x) * 0.06, 0, sentido * comp / 2);
  g.add(corpo, ponta, eixo, placa);
  return g;
}

function chassi() {
  const g = new THREE.Group();
  g.name = 'chassi';
  const base = caixa(0.32, 0.22, 1.0, mat.chassi); base.position.y = -0.12;
  const eixoF = cilindro(0.03, 0.75, mat.metal); eixoF.rotation.z = Math.PI / 2; eixoF.position.set(0, -0.117, 0.326);
  const eixoT = eixoF.clone(); eixoT.position.z = -0.326;
  g.add(base, eixoF, eixoT);
  return g;
}

function plataforma() {
  // Placa de montagem baixa, encaixada entre as esteiras (no lugar da antiga
  // pilha de acrílico). Braço, câmera e compartimento ficam apoiados nela.
  const g = new THREE.Group();
  g.name = 'plataforma';
  const placa = caixa(0.29, 0.015, 0.9, mat.chassi);
  placa.position.y = PLACA_Y - 0.0075;
  g.add(placa);
  // colunas até o fundo do chassi
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const col = cilindro(0.012, 0.16, mat.metal, 8);
    col.position.set(sx * 0.12, PLACA_Y - 0.09, sz * 0.38);
    g.add(col);
  }
  return g;
}

// ---------- Peças que o CAD atual ainda não tem ----------

function raspberry() {
  // Raspberry Pi 4: 85 × 56 mm → ~0.357 × 0.235 na escala do modelo
  const g = new THREE.Group();
  g.name = 'raspberry';
  g.position.set(0, -0.025, 0); // dentro do chassi, embaixo da placa de montagem
  const placa = caixa(0.235, 0.014, 0.357, mat.pcb);
  const soc = caixa(0.06, 0.012, 0.06, mat.metal); soc.position.set(0, 0.013, 0.02);
  const ram = caixa(0.05, 0.01, 0.04, mat.preto); ram.position.set(0.02, 0.012, -0.07);
  const usb1 = caixa(0.065, 0.065, 0.075, mat.metal); usb1.position.set(-0.07, 0.04, -0.16);
  const usb2 = usb1.clone(); usb2.position.x = 0.0;
  const eth = caixa(0.07, 0.06, 0.08, mat.metal); eth.position.set(0.075, 0.037, -0.16);
  const gpio = caixa(0.022, 0.03, 0.21, mat.preto); gpio.position.set(-0.1, 0.02, 0.04);
  g.add(placa, soc, ram, usb1, usb2, eth, gpio);
  return g;
}

function camera() {
  const g = new THREE.Group();
  g.name = 'camera';
  // mastro apoiado na placa, entre a base do braço e o compartimento
  g.position.set(-0.11, PLACA_Y + 0.38, 0.05);
  const pe = cilindro(0.04, 0.012, mat.metal, 16); pe.position.y = -0.374;
  const mastro = cilindro(0.015, 0.38, mat.metal, 10); mastro.position.y = -0.19;
  g.add(pe);
  const corpo = caixa(0.13, 0.09, 0.07, mat.preto);
  const lente = cilindro(0.032, 0.04, mat.lente); lente.rotation.x = Math.PI / 2; lente.position.z = 0.05;
  const anel = cilindro(0.04, 0.012, mat.garra); anel.rotation.x = Math.PI / 2; anel.position.z = 0.036;
  g.add(mastro, corpo, lente, anel);
  return g;
}

// Articulação: um grupo vazio com pivô próprio + um "motor" visual
function junta(nome, y, eixo = 'x') {
  const j = new THREE.Group();
  j.name = nome;
  j.position.y = y;
  const motor = cilindro(0.045, 0.09, mat.junta, 16);
  if (eixo === 'x') motor.rotation.z = Math.PI / 2; // eixo de giro em X (ombro, cotovelo, punho)
  else motor.scale.set(0.9, 0.35, 0.9);              // eixo em Y (base e rotações)
  j.add(motor);
  return j;
}

function garra() {
  // Braço robótico de 6 graus de liberdade + garra de dois dedos.
  // Cadeia: base → J1 (giro da base, Y) → J2 (ombro, X) → J3 (cotovelo, X)
  //         → J4 (giro do antebraço, Y) → J5 (punho, X) → J6 (giro do punho, Y) → garra
  // Com todos os ângulos em 0 o braço fica reto apontando para cima (+Y).
  const { L1 } = BRACO;
  const g = new THREE.Group();
  g.name = 'garra';
  g.position.set(0, PLACA_Y, 0.3); // apoiado na placa, na frente
  const base = cilindro(0.1, 0.06, mat.garra, 24); base.position.y = 0.03;
  g.add(base);

  const j1 = junta('braco_j1', 0.06, 'y');
  const torre = caixa(0.13, 0.1, 0.13, mat.garra); torre.position.y = 0.05;
  j1.add(torre);
  g.add(j1);

  const j2 = junta('braco_j2', 0.1);
  const l1 = caixa(0.07, L1, 0.07, mat.garra); l1.position.y = L1 / 2;
  j2.add(l1);
  j1.add(j2);

  const j3 = junta('braco_j3', L1);
  const l2a = caixa(0.06, 0.22, 0.06, mat.garra); l2a.position.y = 0.11;
  j3.add(l2a);
  j2.add(j3);

  const j4 = junta('braco_j4', 0.22, 'y');
  const l2b = cilindro(0.028, 0.26, mat.garra, 12); l2b.position.y = 0.13;
  j4.add(l2b);
  j3.add(j4);

  const j5 = junta('braco_j5', 0.26);
  const l3 = caixa(0.05, 0.08, 0.05, mat.garra); l3.position.y = 0.04;
  j5.add(l3);
  j4.add(j5);

  const j6 = junta('braco_j6', 0.08, 'y');
  const palma = caixa(0.38, 0.04, 0.08, mat.junta); palma.position.y = 0.02;
  j6.add(palma);
  j5.add(j6);

  // Dedos: pivô na palma, giram em Z para abrir/fechar
  for (const lado of [-1, 1]) {
    const piv = new THREE.Group();
    piv.name = lado > 0 ? 'garra_dedo_e' : 'garra_dedo_d';
    piv.position.set(lado * 0.165, 0.04, 0);
    const dedo = caixa(0.03, 0.2, 0.06, mat.garra); dedo.position.y = 0.1;
    const ponta = caixa(0.03, 0.04, 0.06, mat.junta); ponta.position.set(-lado * 0.015, 0.19, 0);
    piv.add(dedo, ponta);
    j6.add(piv);
  }

  // Sensor ultrassônico no punho, olhando na direção da garra
  j6.add(sensorUltrassonico({ noPunho: true }));

  // Pontos de referência (vazios) usados pela cena
  const pega = new THREE.Object3D(); pega.name = 'garra_ponta'; pega.position.y = 0.16;
  const centro = new THREE.Object3D(); centro.name = 'garra_centro_lata'; centro.position.y = 0.24;
  j6.add(pega, centro);
  return g;
}

function compartimento() {
  // Caixa aberta em cima do robô, onde o braço deposita os resíduos.
  // Apoiado direto na placa de montagem, na traseira.
  const g = new THREE.Group();
  g.name = 'compartimento';
  g.position.set(0, PLACA_Y, -0.24);
  const L = 0.32, P = 0.42, h = 0.36; // largura (cabe entre as esteiras), profundidade, altura
  const fundo = caixa(L, 0.02, P, mat.quadro); fundo.position.y = 0.01;
  g.add(fundo);
  const yc = 0.02 + h / 2;
  const frente = caixa(L, h, 0.015, mat.acrilicoVerde); frente.position.set(0, yc, P / 2 - 0.0075);
  const tras = frente.clone(); tras.position.z = -P / 2 + 0.0075;
  const esq = caixa(0.015, h, P, mat.acrilicoVerde); esq.position.set(L / 2 - 0.0075, yc, 0);
  const dir = esq.clone(); dir.position.x = -L / 2 + 0.0075;
  g.add(frente, tras, esq, dir);
  // cantoneiras e borda superior opacas para marcar o contorno
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = caixa(0.025, h, 0.025, mat.quadro);
    c.position.set(sx * (L / 2 - 0.0125), yc, sz * (P / 2 - 0.0125));
    g.add(c);
  }
  const bordaF = caixa(L + 0.01, 0.02, 0.02, mat.quadro); bordaF.position.set(0, 0.02 + h, P / 2);
  const bordaT = bordaF.clone(); bordaT.position.z = -P / 2;
  const bordaE = caixa(0.02, 0.02, P + 0.01, mat.quadro); bordaE.position.set(L / 2, 0.02 + h, 0);
  const bordaD = bordaE.clone(); bordaD.position.x = -L / 2;
  g.add(bordaF, bordaT, bordaE, bordaD);
  // onde o centro de um resíduo (lata) fica depois de depositado
  const repouso = new THREE.Object3D(); repouso.name = 'compartimento_fundo'; repouso.position.y = 0.02 + 0.23;
  g.add(repouso);
  return g;
}

function sensorUltrassonico({ noPunho = false } = {}) {
  // HC-SR04: placa azul com dois transdutores cilíndricos.
  // No punho: virado para +Y (direção da garra). Solto: na frente do chassi (+Z).
  const g = new THREE.Group();
  g.name = 'sensor_ultrassonico';
  const placa = caixa(0.19, 0.09, 0.01, mat.pcbAzul);
  g.add(placa);
  for (const lado of [-1, 1]) {
    const t = cilindro(0.033, 0.05, mat.metal); t.rotation.x = Math.PI / 2; t.position.set(lado * 0.055, 0, 0.03);
    const tela = cilindro(0.026, 0.002, mat.preto); tela.rotation.x = Math.PI / 2; tela.position.set(lado * 0.055, 0, 0.056);
    g.add(t, tela);
  }
  if (noPunho) {
    g.rotation.x = -Math.PI / 2;      // frente do sensor passa a olhar para +Y
    g.position.set(0, 0.0, 0.085);    // ao lado da palma
  } else {
    g.position.set(0, -0.07, 0.6);
  }
  return g;
}

const FABRICAS = {
  plataforma,
  esteira_esq: () => esteira('esteira_esq', 0.252),
  esteira_dir: () => esteira('esteira_dir', -0.252),
  flipper_fe: () => flipper('flipper_fe', 0.315, 0.326),
  flipper_fd: () => flipper('flipper_fd', -0.315, 0.326),
  flipper_te: () => flipper('flipper_te', 0.315, -0.326),
  flipper_td: () => flipper('flipper_td', -0.315, -0.326),
  garra,
  compartimento,
  raspberry,
  sensor_ultrassonico: () => sensorUltrassonico(),
  camera,
};

/** Robô inteiro procedural (quando o .glb não existe). */
export function criarRoboPlaceholder() {
  const raiz = new THREE.Group();
  raiz.name = 'robo_placeholder';
  raiz.add(chassi());
  for (const nome of PECAS) raiz.add(FABRICAS[nome]());
  return raiz;
}

/** Cria só as peças que estiverem faltando no modelo carregado. Retorna os nomes criados. */
export function completarPecas(modelo) {
  const criadas = [];
  for (const nome of PECAS) {
    if (!modelo.getObjectByName(nome)) {
      modelo.add(FABRICAS[nome]());
      criadas.push(nome);
    }
  }
  return criadas;
}
