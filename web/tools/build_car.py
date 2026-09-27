"""Original procedural RoadForge coupe assets. All geometry is authored here."""
from pathlib import Path
import numpy as np
import trimesh

OUT = Path(__file__).resolve().parents[1] / 'public' / 'models'
OUT.mkdir(parents=True, exist_ok=True)

def mesh(vertices, faces, color):
    m = trimesh.Trimesh(vertices=np.array(vertices), faces=np.array(faces), process=False)
    m.visual.vertex_colors = color
    return m

def prism(sections, color):
    # Cross sections: x, half-width, lower-z, upper-z
    v = []
    for x, w, bottom, top in sections:
        v.extend([(x,-w,bottom),(x,w,bottom),(x,w,top),(x,-w,top)])
    f = [(3,2,1),(3,1,0)]
    for i in range(len(sections)-1):
        a,b = i*4,(i+1)*4
        for j in range(4):
            k=(j+1)%4
            f.extend([(a+j,b+j,b+k),(a+j,b+k,a+k)])
    n=(len(sections)-1)*4
    f.extend([(n,n+1,n+2),(n,n+2,n+3)])
    return mesh(v,f,color)

def box(size, center, color):
    m=trimesh.creation.box(extents=size)
    m.apply_translation(center)
    m.visual.vertex_colors=color
    return m

body=trimesh.Scene()
body.add_geometry(prism([(-2.37,.72,.30,.61),(-1.90,.93,.28,.76),(.94,.94,.28,.78),(1.95,.85,.30,.69),(2.34,.72,.34,.54)], [31,53,67,255]), node_name='sculpted-body')
body.add_geometry(prism([(-1.34,.78,.73,.75),(-.72,.71,.76,1.39),(.69,.70,.76,1.40),(1.26,.78,.75,.77)], [19,32,43,255]), node_name='cabin')
body.add_geometry(prism([(-1.26,.75,.77,.78),(-.68,.68,.82,1.34),(.64,.67,.82,1.34),(1.20,.75,.77,.78)], [35,68,82,255]), node_name='glass')
body.add_geometry(box((1.32,1.34,.07),(-.03,0,1.42),[24,43,54,255]), node_name='roof')
body.add_geometry(box((1.55,1.46,.055),(1.48,0,.79),[47,78,91,255]), node_name='hood')
body.add_geometry(box((1.02,1.49,.055),(-1.73,0,.78),[47,78,91,255]), node_name='trunk')
body.add_geometry(box((.055,1.38,.12),(2.31,0,.49),[12,19,24,255]), node_name='front-grille')
body.add_geometry(box((.06,1.38,.10),(-2.34,0,.48),[15,20,25,255]), node_name='rear-diffuser')
for y in (-.64,.64):
    body.add_geometry(box((.035,.36,.115),(2.31,y,.65),[184,236,245,255]), node_name=f'headlight-{y}')
    body.add_geometry(box((.035,.35,.105),(-2.35,y,.68),[238,67,57,255]), node_name=f'taillight-{y}')
    body.add_geometry(box((.32,.055,.08),(.18,1.00 if y>0 else -1.00,1.09),[32,52,63,255]), node_name=f'mirror-{y}')
to_gltf_y_up = trimesh.transformations.rotation_matrix(-np.pi/2,[1,0,0])
for geometry in body.geometry.values():
    geometry.apply_transform(to_gltf_y_up)
body.export(OUT/'car.glb')

wheel=trimesh.Scene()
def cylinder(radius,width,color,name):
    m=trimesh.creation.cylinder(radius=radius,height=width,sections=24)
    m.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2,[1,0,0]))
    m.visual.vertex_colors=color
    wheel.add_geometry(m,node_name=name)
cylinder(.39,.23,[17,23,27,255],'tire')
cylinder(.26,.244,[121,140,151,255],'alloy')
cylinder(.10,.248,[31,49,59,255],'hub')
for geometry in wheel.geometry.values():
    geometry.apply_transform(to_gltf_y_up)
wheel.export(OUT/'wheel.glb')
print('Wrote original car.glb and wheel.glb')
