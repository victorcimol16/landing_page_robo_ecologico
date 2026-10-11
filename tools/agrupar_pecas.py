# Passo 2 do pipeline: agrupa as malhas do GLB bruto em peças com os nomes
# que a página usa (esteira_esq, flipper_fe, ...), gira para Y-para-cima com a
# frente em +Z, centraliza e normaliza (maior medida = 2 unidades).
# Uso: python tools/agrupar_pecas.py bruto.glb agrupado.glb
import sys, trimesh, numpy as np, collections
src, dst = sys.argv[1], sys.argv[2]
sc = trimesh.load(src, force='scene'); g = sc.graph

def top(n):
    path=[]; cur=n
    while cur != g.base_frame:
        path.append(cur); cur = g.transforms.parents.get(cur)
        if cur is None: break
    return path[-2] if len(path)>1 else path[-1]   # ancestral logo abaixo da raiz

MAP = {
 'track chain v2:2':'esteira_esq', 'GT2_40teeth_10bore v2:2':'esteira_esq',
 'track chain v2:1':'esteira_dir', 'GT2_40teeth_10bore v2:1':'esteira_dir',
 'filpper v6:4':'flipper_fe', 'filpper v6:1':'flipper_te',
 'filpper v6:3':'flipper_fd', 'filpper v6:2':'flipper_td',
}
# Z-up (CAD) -> Y-up (three), frente do robô (+Y do CAD) -> +Z
R = np.array([[-1,0,0,0],[0,0,1,0],[0,1,0,0],[0,0,0,1]], float)
buckets = collections.defaultdict(list)
tops=set()
for n in g.nodes_geometry:
    T, gn = g[n]; m = sc.geometry[gn].copy()
    t = top(n); tops.add(t)
    if t.startswith('smile motor'): continue  # peça solta fora do robô no CAD
    if t.startswith('ele v6'): continue       # pilha de placas azuis removida (libera o topo)
    grp = MAP.get(t, 'chassi')
    col = tuple(int(c) for c in m.visual.material.baseColorFactor) if hasattr(m.visual,'material') and m.visual.material.baseColorFactor is not None else (180,180,180,255)
    m.apply_transform(R @ T)
    buckets[(grp, col)].append(m)
print(sorted(tops))
allv = np.vstack([np.vstack([x.vertices for x in v]) for v in buckets.values()])
lo, hi = allv.min(0), allv.max(0); c = (lo+hi)/2; s = 2.0/(hi-lo).max()
# referencial fixo da página: chão (fundo das esteiras) em y = -0.335
c[1] = lo[1] + 0.335 / s
print("dims m", (hi-lo).round(3), "scale", s)
groups = collections.defaultdict(list)
for (grp,col), ms in buckets.items():
    m = trimesh.util.concatenate(ms)
    m.vertices = (m.vertices - c) * s
    m.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
        baseColorFactor=np.array(col,dtype=np.uint8), metallicFactor=0.1, roughnessFactor=0.7))
    groups[grp].append((col, m))
out = trimesh.Scene()
for grp, lst in groups.items():
    V = np.vstack([m.vertices for _,m in lst]); blo, bhi = V.min(0), V.max(0)
    piv = (blo+bhi)/2
    if grp.startswith('flipper'):
        # eixo do flipper = extremidade interna (mais perto do centro em Z)
        r = (bhi[1]-blo[1])/2
        zin = blo[2] if piv[2] > 0 else bhi[2]
        piv = np.array([piv[0], piv[1], zin + (r if piv[2] > 0 else -r)])
    Tg = np.eye(4); Tg[:3,3] = piv
    out.graph.update(frame_from=out.graph.base_frame, frame_to=grp, matrix=Tg)
    for i,(col,m) in enumerate(lst):
        m.vertices = m.vertices - piv
        name = f"{grp}_m{i}"
        out.add_geometry(m, node_name=name, geom_name=name, parent_node_name=grp)
    print(grp, len(lst), "malhas", sum(len(m.faces) for _,m in lst), "faces", "pivo", piv.round(3), "bbox", (bhi-blo).round(3))
out.export(dst)
