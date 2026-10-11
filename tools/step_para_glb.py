# Passo 1 do pipeline do modelo: STEP (CAD) -> GLB bruto.
# Uso: python tools/step_para_glb.py assets-src/robo.step bruto.glb
# Requer: pip install cascadio trimesh
import sys, time, cascadio

t = time.time()
# tol_linear/tol_angular controlam a densidade da malha (maior = mais leve)
cascadio.step_to_glb(sys.argv[1], sys.argv[2], tol_linear=0.3, tol_angular=0.5)
print("ok", round(time.time() - t, 1), "s")
