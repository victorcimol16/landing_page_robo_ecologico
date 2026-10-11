# Robô Ecológico · landing page do TCC (Feintec 2026)

Landing page interativa do TCC **"Robô Ecológico: Coletando Resíduos Recicláveis no CIMOL"**
(Victor Gabriel Kohlrausch, Técnico em Informática, ETE Monteiro Lobato / CIMOL, Taquara/RS;
orientador Prof. Cândido Luciano de Farias).

Vite + JavaScript puro, Three.js (uma única cena WebGL fixa ao fundo), GSAP + ScrollTrigger e Lenis.

## Rodar localmente

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # gera a pasta dist/
npm run preview    # serve o dist/ para testar o build
```

Requer Node 18 ou mais novo.

## Estrutura

```
index.html              todo o conteúdo em HTML semântico (funciona sem o 3D)
src/main.js             entrada: detecção de aparelho, loader, 3D sob demanda, giroscópio, QR code
src/estado.js           estado compartilhado entre o scroll e a cena (+ constantes)
src/scene.js            a cena WebGL única: renderer, luzes, robô, lata, base, render sob demanda
src/placeholder.js      peças procedurais (caixas/cilindros) com os nomes oficiais
src/animations.js       Lenis + ScrollTrigger: presets por seção, pins, scrub, movimento reduzido
src/hud.js              rótulos com linha guia, caixa estilo YOLO e leitura do ultrassônico
src/slam.js             simulação 2D do mapeamento SLAM (canvas 2D, não WebGL)
src/styles.css          identidade visual, mobile first
public/models/robo.glb  modelo 3D (Draco)
public/draco/           decodificador Draco (copiado de three/examples)
public/img/robo-cad.jpg imagem estática para navegadores sem WebGL
tools/                  scripts de conversão STEP → GLB
```

## O modelo 3D

`public/models/robo.glb` foi gerado a partir do CAD `rmrc_Component3 v21.step` (chassi com esteiras e
quatro flippers). As malhas foram agrupadas nas peças:

| nome no GLB | o que é |
|---|---|
| `esteira_esq`, `esteira_dir` | esteiras laterais + polias |
| `flipper_fe`, `flipper_fd`, `flipper_te`, `flipper_td` | flippers (frente/trás, esquerda/direita); o pivô de cada grupo fica no eixo de giro |
| `chassi` | estrutura, motores, eixos e engrenagens |
| ~~`eletronica`~~ | pilha de placas azuis do CAD: removida no `tools/agrupar_pecas.py` para liberar o topo |

O CAD **ainda não tem** o braço com garra (`garra`), o `compartimento`, o `raspberry`, o
`sensor_ultrassonico` e a `camera`. A página detecta as peças que faltam e cria versões procedurais
simples com esses nomes (ver `completarPecas` em `src/placeholder.js`). A seção "Vista explodida" avisa
isso ao visitante. Se `robo.glb` não existir, o robô inteiro é gerado proceduralmente.

### Braço 6 DOF e compartimento

- `garra` é um braço de 6 articulações: `braco_j1` (giro da base, Y) → `braco_j2` (ombro, X) →
  `braco_j3` (cotovelo, X) → `braco_j4` (giro do antebraço, Y) → `braco_j5` (punho, X) →
  `braco_j6` (giro do punho, Y) → dedos `garra_dedo_e` / `garra_dedo_d` (abrem em Z).
  O sensor ultrassônico fica no punho. Medidas em `BRACO` (`src/placeholder.js`).
- A cena não anima ângulos diretamente: as animações definem um **alvo** para a garra (giro da base,
  distância, altura, ângulo e giro do punho) e `poseBraco()` em `src/scene.js` resolve os ângulos por
  cinemática inversa. As poses-chave estão em `POSES_BRACO` (`src/estado.js`) e a sequência em
  `ROTEIRO_BRACO` (`src/animations.js`).
- `plataforma` é a placa de montagem entre as esteiras (topo em y = 0,1) onde braço, câmera e compartimento
  se apoiam; o Raspberry Pi fica embaixo dela, dentro do chassi.
- `compartimento` é a caixa aberta na traseira, apoiada na placa; o ponto vazio
  `compartimento_fundo` marca onde o resíduo fica depois de depositado.
- Ao modelar essas peças no CAD, mantenha os mesmos nomes de nós e pivôs nas articulações
  (com todos os ângulos em 0 o braço aponta reto para cima, +Y).

Convenções: Y para cima, frente do robô em +Z, chão em y ≈ -0,335, maior medida ≈ 2 unidades
(1 m = 4,194 unidades, usado para a leitura em cm do ultrassônico).

### Trocar o modelo / atualizar o robo.glb

1. Exporte o CAD em STEP ou GLB. No GLB, dê às peças (nós) **exatamente** os nomes da tabela acima e
   também `garra`, `raspberry`, `sensor_ultrassonico` e `camera` quando elas existirem.
   Opcional: dedos da garra como nós `garra_dedo_e` e `garra_dedo_d` (pivô na articulação) para a
   animação de abrir e fechar.
2. Para refazer a partir do STEP (Python 3.11+, `pip install cascadio trimesh`):

   ```bash
   python tools/step_para_glb.py assets-src/robo.step bruto.glb
   python tools/agrupar_pecas.py bruto.glb agrupado.glb   # ajuste o dicionário MAP se os nomes do CAD mudarem
   npx @gltf-transform/cli weld agrupado.glb w.glb
   npx @gltf-transform/cli simplify w.glb s.glb --ratio 0.25 --error 0.003
   npx @gltf-transform/cli draco s.glb public/models/robo.glb --quantize-position 14
   ```

   Não use `gltf-transform optimize`/`join`/`flatten`: eles juntam as peças e a vista explodida deixa
   de funcionar.
3. Recarregue a página. O console avisa quais peças foram completadas proceduralmente.
4. Se as proporções mudarem, ajuste os deslocamentos da explosão em `EXPLOSAO` (`src/scene.js`) e as
   posições das peças procedurais em `src/placeholder.js`.

## Publicar na Vercel

O projeto já está pronto para a Vercel (`vercel.json`: framework Vite, `npm run build`, saída `dist`,
cache longo para `assets/`, `draco/` e `models/`).

1. Entre em [vercel.com](https://vercel.com) com a conta do GitHub → **Add New… → Project**.
2. Importe o repositório `victorcimol16/landing_page_robo_ecologico`.
3. Não precisa mudar nada nas configurações: clique em **Deploy**.
4. A cada `git push` na `main` a Vercel publica de novo sozinha (e cria prévias para outras branches).

O QR code do rodapé é gerado com a URL em que a página estiver aberta, então ele já aponta para o
endereço da Vercel (ou para o domínio próprio, se você configurar um).

Também funciona em qualquer hospedagem estática (GitHub Pages, Netlify): `vite.config.js` usa
`base: './'`, então o `dist/` roda até em subpasta.

## Desempenho e acessibilidade

- Bundle inicial ~55 KB gzip; Three.js e a cena (~150 KB gzip) são carregados sob demanda depois do
  evento `load`. JS total ≈ 215 KB gzip, sem contar o `.glb` (~410 KB).
- Pixel ratio máx. 2 (1,5 no celular). Aparelho fraco (≤ 4 núcleos ou tela < 768 px): sem sombras,
  sem antialias, 2 luzes. WebGL por software (sem GPU): sem giro contínuo.
- Render sob demanda: só desenha quando o estado muda; pausa com a aba oculta.
- Lighthouse mobile medido no `vite preview` (sem gzip): Performance 82–88, Acessibilidade 100,
  Boas práticas 100. Na Vercel (com compressão) tende a ficar melhor.
- `prefers-reduced-motion`: sem Lenis, sem pin/scrub, sem giro; os estados mudam direto por seção.
- Canvas com `pointer-events: none`: toques nunca prendem a rolagem.
- Sem WebGL: imagem estática do CAD + todo o conteúdo em HTML.

### Testes automatizados

Em abas sem foco (automação), o navegador não dispara `requestAnimationFrame`. Abrir a página com
`?teste-raf` simula os quadros com `setTimeout` (só para testes).

## Feintec "acontecendo agora"

De 3 a 5 de novembro de 2026 (horário de Brasília) a página mostra o selo "Acontecendo agora" no topo
e destaca a Feintec na linha do tempo; depois do dia 5 ela aparece como concluída (`src/feintec.js`).
Para conferir antes do evento, abra a página com `?data=2026-11-04` (ou `?data=2026-11-06`).
