// =============================================================
// estado.js — o "contrato" entre o scroll e a cena 3D
// -------------------------------------------------------------
// Fica separado do scene.js de propósito: assim as animações de
// scroll funcionam antes do Three.js terminar de carregar (ele é
// importado sob demanda, o que deixa a primeira pintura bem mais rápida).
// =============================================================

// Valores iniciais de tudo que as animações podem mexer
export const ESTADO_INICIAL = {
  // câmera e enquadramento
  camX: 2.6, camY: 1.5, camZ: 3.4,
  lookX: 0, lookY: -0.05, lookZ: 0,
  shiftX: 0, shiftY: 0,       // desloca o robô na tela (fração da largura/altura)
  // robô
  robotX: 0, robotZ: 0, robotRotY: -0.6,
  spinMix: 1,                 // 1 = rotação automática do hero ativa
  follow: 1,                  // 1 = robô segue mouse/giroscópio
  explode: 0,                 // 0..1 vista explodida
  flip: 0,                    // ângulo dos flippers (rad)
  grip: 1,                    // 0 = garra aberta, 1 = fechada
  // braço 6 DOF: alvo da garra em coordenadas do braço (resolvido por IK na cena)
  armYaw: 0,                  // giro da base (rad)
  armR: 0.42,                 // distância horizontal do eixo da base até o ponto de pega
  armH: 0.1,                  // altura do ponto de pega (relativa à base do braço)
  armPsi: 1.75,               // ângulo da garra a partir da vertical (π = apontando para baixo)
  armRoll: 0,                 // giro do punho (rad)
  // cena da coleta
  canVis: 0, carry: 0, canBin: 0, baseVis: 0,
  // camadas HTML (lidas pelo hud.js)
  labels: 0, yolo: 0, sonar: 0,
  opacidade: 1,               // opacidade do canvas inteiro
};

// Poses-chave do braço (mesmos campos do estado). A cena calcula os
// ângulos das 6 articulações a partir delas (cinemática inversa).
export const POSES_BRACO = {
  repouso: { armYaw: 0, armR: 0.42, armH: 0.1, armPsi: 1.75, armRoll: 0 },
  aproximar: { armYaw: 0, armR: 0.62, armH: 0.05, armPsi: 1.65, armRoll: 0 },
  acimaLata: { armYaw: 0, armR: 0.81, armH: 0.2, armPsi: Math.PI, armRoll: Math.PI / 2 },
  pegar: { armYaw: 0, armR: 0.81, armH: -0.115, armPsi: Math.PI, armRoll: Math.PI / 2 },
  levantar: { armYaw: 0, armR: 0.5, armH: 0.75, armPsi: Math.PI, armRoll: Math.PI / 2 },
  sobreCaixa: { armYaw: Math.PI, armR: 0.54, armH: 0.72, armPsi: Math.PI, armRoll: Math.PI / 2 },
};
// z (no referencial do robô) onde a lata fica quando o braço a pega:
// base do braço em z = 0.3 + alcance horizontal da pose "pegar"
export const ALCANCE_LATA = 0.3 + 0.81;

export const LATA_Z = 3.6;     // posição da lata na demonstração
export const BASE_Z = -1.9;    // posição da base de descarte
export const ESCALA_M = 4.194; // unidades do modelo por metro (escala usada na conversão do CAD)

/**
 * Cria o estado observável. `valores` é um Proxy: qualquer escrita
 * que mude um número avisa os ouvintes (a cena marca "sujo" e
 * agenda um quadro).
 */
export function criarEstado() {
  const bruto = { ...ESTADO_INICIAL };
  const ouvintes = [];
  const valores = new Proxy(bruto, {
    set(o, k, v) {
      if (o[k] !== v) {
        o[k] = v;
        for (const f of ouvintes) f();
      }
      return true;
    },
  });
  return { valores, bruto, aoMudar: (f) => ouvintes.push(f) };
}
