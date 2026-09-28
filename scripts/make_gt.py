"""RoadForge GT — original, parametric bodywork. No third-party assets.

Run with Python 3, numpy and trimesh. Units: metres. Authoring axes X forward,
Y left, Z up; exported glTF axes X left, Y up, Z forward, for Cesium.
"""
from pathlib import Path
import json
import struct
import numpy as np
import trimesh as tm

OUT = Path(__file__).resolve().parents[1] / 'web/public/models'
OUT.mkdir(parents=True, exist_ok=True)

def material(name, color, metal=0, rough=.4, emission=None, alpha=None):
    c = [int(v * 255) for v in color] + [255 if alpha is None else int(alpha * 255)]
    return tm.visual.material.PBRMaterial(name=name, baseColorFactor=c,
        metallicFactor=metal, roughnessFactor=rough, emissiveFactor=emission,
        alphaMode='OPAQUE' if alpha is None else 'BLEND', doubleSided=True)

paint = material('Graphite titanium • clearcoat', (.24, .255, .255), .76, .24)
edgepaint = material('Satin titanium', (.16, .17, .17), .72, .29)
glass = material('Smoked blue glass', (.025, .075, .105), .55, .12)
windshield = material('Windscreen glass', (.09, .14, .16), .32, .10, alpha=.60)
rubber = material('Tire rubber', (.018, .021, .024), .0, .94)
treadmat = material('Tread channels', (.006, .007, .009), .0, 1)
black = material('Obsidian trim', (.015, .02, .026), .3, .33)
seam = material('Panel seams', (.008, .011, .013), .2, .55)
alloy = material('Machined forged alloy', (.56, .59, .60), .9, .23)
rimdark = material('Wheel graphite', (.07, .08, .085), .8, .27)
disc = material('Brake steel', (.25, .26, .27), .85, .46)
caliper = material('Copper brake calipers', (.46, .16, .058), .6, .34)
white = material('LED ceramic', (.87, .94, 1), .0, .2, [3.8, 4.1, 4.5])
red = material('Ruby tail lamps', (.58, .012, .012), .1, .2, [2.4, .012, .008])
interior = material('Charcoal leather', (.027, .025, .024), .0, .87)

car = tm.Scene()
wheel = tm.Scene()
counter = 0

def add(mesh, mat, name='part', scene=car):
    global counter
    counter += 1
    mesh.visual = tm.visual.TextureVisuals(material=mat)
    mesh.fix_normals()
    scene.add_geometry(mesh, node_name=f'{name}_{counter}', geom_name=f'{name}_{counter}')
    return mesh

def grid(fun, nu, nv, mat, name, scene=car):
    verts = [fun(i / nu, j / nv) for i in range(nu + 1) for j in range(nv + 1)]
    faces = []
    for i in range(nu):
        for j in range(nv):
            a = i * (nv + 1) + j
            faces.extend([[a, a + nv + 1, a + 1], [a + 1, a + nv + 1, a + nv + 2]])
    return add(tm.Trimesh(vertices=verts, faces=faces, process=False), mat, name, scene)

def tube(points, radius, mat, name='trim', scene=car, sides=8):
    points = np.array(points, float)
    verts = []
    for i, p in enumerate(points):
        tangent = points[min(i + 1, len(points) - 1)] - points[max(0, i - 1)]
        tangent /= np.linalg.norm(tangent)
        other = np.array([0., 0., 1.]) if abs(tangent[2]) < .9 else np.array([0., 1., 0.])
        u = np.cross(tangent, other); u /= np.linalg.norm(u)
        v = np.cross(tangent, u)
        for j in range(sides):
            t = j * 2 * np.pi / sides
            verts.append(p + radius * (u * np.cos(t) + v * np.sin(t)))
    faces = []
    for i in range(len(points) - 1):
        for j in range(sides):
            a, b = i * sides + j, i * sides + (j + 1) % sides
            faces.extend([[a, b, a + sides], [b, b + sides, a + sides]])
    return add(tm.Trimesh(verts, faces, process=False), mat, name, scene)

def ellipsoid(center, radii, mat, name, scene=car):
    mesh = tm.creation.uv_sphere(count=[4, 8] if max(radii)<.026 else ([8, 12] if max(radii)<.09 else [12, 18]))
    mesh.apply_scale(radii); mesh.apply_translation(center)
    return add(mesh, mat, name, scene)

def box(center, extents, mat, name, scene=car):
    mesh = tm.creation.box(extents=extents)
    mesh.apply_translation(center)
    return add(mesh, mat, name, scene)

def interp(x, knots):
    # Cosine-eased profile avoids angular shoulders without an interpolation dependency.
    for (x0, y0), (x1, y1) in zip(knots, knots[1:]):
        if x <= x1:
            t = np.clip((x - x0) / (x1 - x0), 0, 1)
            t = .5 - .5 * np.cos(t * np.pi)
            return y0 + (y1 - y0) * t
    return knots[-1][1]

def width(x):
    return interp(x, [(-2.36,.77),(-2.12,.93),(-1.45,.97),(-.45,.90),(.55,.91),(1.42,.955),(2.03,.87),(2.36,.70)])

def deck(x):
    return interp(x, [(-2.36,.65),(-2.1,.74),(-1.35,.84),(-.45,.85),(.55,.83),(1.35,.755),(2.1,.665),(2.36,.565)])

def haunch(x):
    return .070 * np.exp(-((x + 1.40) / .52) ** 2) + .085 * np.exp(-((x - 1.42) / .48) ** 2)

def arch(x):
    z = .205
    for axle in [-1.40, 1.42]:
        dx = x - axle
        if abs(dx) < .414:
            z = max(z, .366 + np.sqrt(.414 ** 2 - dx ** 2))
    return z

def top(x, t):
    return deck(x) + .024 * (1-t*t) + haunch(x) * np.exp(-((t-.83)/.24) ** 2) - .044*t**8

# A continuous bonnet/rear-deck surface, with the roof as a separate assembly.
grid(lambda u,v: (x := -2.36+4.72*u, (t := -1+2*v)*width(x), top(x,abs(t))),
     100, 24, paint, 'Sculpted body crown')
for side in [-1,1]:
    def flank(u,v,side=side):
        x = -2.36+4.72*u
        z0, z1 = arch(x), top(x,1)
        y = width(x) * (1-.048*(1-v)**2) - .020*np.sin(v*np.pi)*np.exp(-(x/.9)**2)
        return x, side*y, z0 + (z1-z0)*v
    grid(flank, 180, 8, paint, 'Wheel-cut flank')
    # Sill stays inside the wheelbase, making the two round openings real holes.
    grid(lambda u,v,side=side: (-.98+1.97*u, side*(.87+.045*np.sin(v*np.pi)), .18+.105*v),
         40, 8, edgepaint, 'Sculpted side sill')
    tube([(-.97+1.92*t,side*(width(-.97+1.92*t)-.012),.215) for t in np.linspace(0,1,40)],
         .018, black, 'Sill aero lip')
    for axle in [-1.4,1.42]:
        pts=[]
        for a in np.linspace(0,np.pi,64):
            x = axle+.414*np.cos(a)
            pts.append((x, side*(width(x)+.006), .366+.414*np.sin(a)))
        tube(pts,.012,edgepaint,'Rolled wheel-arch lip')
    # Door shut-line around the lower side glass and along the flank.
    door = [(.53,side*(width(.53)+.009),.82),(.65,side*(width(.65)+.009),.65),
            (.62,side*(width(.62)+.009),.30),(-.64,side*(width(-.64)+.009),.28),
            (-.81,side*(width(-.81)+.009),.62),(-.90,side*(width(-.90)+.009),.84)]
    tube(door,.0038,seam,'Door aperture')
    tube([(-.49,side*(width(-.49)+.01),.761),(-.31,side*(width(-.31)+.01),.765)], .011, alloy, 'Flush door handle')
    # Mirrors have rounded housings, stalks, and a black glass inlay.
    tube([(.36,side*.79,1.005),(.31,side*1.01,.995)],.019,black,'Mirror stem')
    ellipsoid((.28,side*1.06,1.025),(.13,.092,.055),paint,'Mirror housing')
    ellipsoid((.17,side*1.059,1.025),(.008,.071,.039),glass,'Mirror glass')

# Curved front and rear faces, with a rounded bumper chin.
for end in [-1,1]:
    x = end*2.36
    def fascia(u,v,x=x,end=end):
        t = -1+2*u
        return (x+end*.033*(1-t*t)*np.sin(v*np.pi), t*width(x),
                .21+v*(top(x,abs(t))-.21))
    grid(fascia, 64,18,paint,'Nose fascia' if end>0 else 'Rear fascia')
    tube([(x+end*.012*(1-t*t),t*width(x)*1.015,.22) for t in np.linspace(-1,1,60)],
        .025,black,'Lower splitter')

# Front grille: a deep, wide inset, with fine horizontal louvres and corner vents.
grid(lambda u,v:(2.392-.02*abs(-1+2*u)**4,(-.54+1.08*u),.29+.20*v),48,5,black,'Main grille')
for z in np.linspace(.308,.46,6):
    tube([(2.402-.02*abs(t)**4,t*.52,z) for t in np.linspace(-1,1,32)],.0055,rimdark,'Grille louvre')
for side in [-1,1]:
    grid(lambda u,v,side=side:(2.38,side*(.57+.10*u),.30+.165*v),10,4,black,'Brake inlet')
    # Headlight assemblies climb onto the front fenders; visible from above and ahead.
    grid(lambda u,v,side=side:(x:=1.88+.36*u,side*(y:=.53+.20*v-.07*u),top(x,y/width(x))+.010),
        24,10,black,'Headlamp lens')
    for row in [0,1]:
        tube([(x:=1.89+.31*t,side*(y:=.57+.094*row-.050*t),top(x,y/width(x))+.023) for t in np.linspace(0,1,24)],
            .009,white,'White LED signature')
    tube([(2.376,side*y,.545+.010*np.sin(t*np.pi)) for t,y in zip(np.linspace(0,1,18),np.linspace(.47,.66,18))],
         .009,white,'Front running lamp')
    for k in range(3):
        x=.80+k*.078
        tube([(x,side*y,top(x,y/width(x))+.007) for y in np.linspace(.66,.79,8)],.007,black,'Fender vent')

# Two narrow red ribbons across the tail, and a diffuser with real exhaust tips.
grid(lambda u,v:(-2.401+.011*abs(-1+2*u)**4,-.735+1.47*u,.558+.103*v),48,6,black,'Recessed tail light panel')
for side in [-1,1]:
    tube([(-2.400+.019*(y/.81)**4,side*y,.615+.016*np.sin(y/.81*np.pi)) for y in np.linspace(.07,.73,42)],
         .019,black,'Tail lamp bezel')
    tube([(-2.407+.019*(y/.81)**4,side*y,.622+.016*np.sin(y/.81*np.pi)) for y in np.linspace(.07,.73,42)],
         .0095,red,'LED tail ribbon')
grid(lambda u,v:(-2.398-.012*np.sin(v*np.pi),-.70+1.40*u,.205+.17*v),40,5,black,'Rear diffuser')
for y in [-.47,-.23,0,.23,.47]:
    box((-2.29,y,.19),(.25,.017,.105),black,'Diffuser fin')
for y in [-.60,.60]:
    pts=[(-2.414,y+.079*np.cos(a),.29+.044*np.sin(a)) for a in np.linspace(0,2*np.pi,40)]
    tube(pts,.009,alloy,'Oval exhaust tip')
    ellipsoid((-2.416,y,.29),(.007,.07,.036),black,'Exhaust interior')
box((-2.407,0,.443),(.014,.285,.074),black,'Rear registration recess')
# Raised ducktail terminates the rear deck in a crisp highlight.
tube([(-2.10-.11*abs(t)**2,t*.85,.768-.016*abs(t)) for t in np.linspace(-1,1,64)],.021,paint,'Integrated ducktail')

# Windscreen and fastback rear glass are smoothly bowed in both directions.
def screen(u,v,rear=False):
    t=-1+2*v
    if rear:
        x=-1.48+.67*u
        z=.854+.44*u+.012*np.sin(u*np.pi)
        half=.75-.13*u
    else:
        x=.69-.65*u
        z=.866+.444*u+.013*np.sin(u*np.pi)
        half=.74-.12*u
    x += (.036 if rear else -.042)*(1-t*t)
    return x,t*half,z+.021*(1-t*t)
grid(lambda u,v:screen(u,v),24,24,windshield,'Panoramic windscreen')
grid(lambda u,v:screen(u,v,True),24,24,glass,'Fastback rear glass')
for rear in [False,True]:
    for side in [0,1]:
        tube([screen(t,side,rear) for t in np.linspace(0,1,32)],.026,paint,'A pillar' if not rear else 'C pillar')
    for edge in [0,1]:
        tube([screen(edge,t,rear) for t in np.linspace(0,1,42)],.018,black,'Glass seal')
grid(lambda u,v:(-.82+.87*u,(-1+2*v)*(.623+.009*np.sin(u*np.pi)),
                 1.306+.028*np.sin(v*np.pi)+.014*np.sin(u*np.pi)),
    24,24,paint,'Double-curvature roof')

def sidetop(x):
    return interp(x,[(-1.46,.855),(-.83,1.293),(.04,1.307),(.69,.866)])
for side in [-1,1]:
    def sidewindow(u,v,side=side):
        x=-1.43+2.10*u
        hi=sidetop(x)
        t=(hi-.855)/.452
        return x,side*(.755-v*.135*t), .855+(hi-.855)*v
    grid(sidewindow,72,10,glass,'Side glazing')
    tube([sidewindow(t,1) for t in np.linspace(0,1,100)],.021,paint,'Roof rail')
    tube([sidewindow(t,0) for t in np.linspace(0,1,100)],.013,alloy,'Window brightwork')
    tube([(-.63,side*.755,.855),(-.65,side*.621,1.305)],.022,black,'B pillar')
    tube([(-1.10,side*.755,.855),(-1.05,side*.665,1.13)],.014,black,'Quarter-glass divider')

# Interior exists in the model for cockpit framing, with instrument binnacle and seats.
box((-.19,0,.64),(1.45,1.40,.13),interior,'Cabin floor')
ellipsoid((.39,0,.875),(.15,.67,.072),interior,'Leather dashboard')
ellipsoid((.35,.33,.935),(.12,.20,.052),black,'Instrument cowl')
for y in [-.34,.34]:
    ellipsoid((-.35,y,.72),(.33,.22,.11),interior,'Sport seat cushion')
    ellipsoid((-.65,y,.94),(.105,.225,.31),interior,'Sport seat back')
    ellipsoid((-.64,y,1.19),(.09,.14,.11),interior,'Head restraint')
box((-.19,0,.80),(.73,.17,.17),black,'Centre console')
tube([(.26+.025*np.sin(a),.34+.144*np.cos(a),.985+.144*np.sin(a)) for a in np.linspace(0,2*np.pi,48)],
     .015,interior,'Steering wheel')
for a in [0,2.1,4.2]:
    tube([(.26,.34,.985),(.26+.025*np.sin(a),.34+.135*np.cos(a),.985+.135*np.sin(a))],.014,black,'Steering spoke')

# Shadowed inner wheel wells and fixed brake calipers.
for x in [-1.4,1.42]:
    for y in [-.89,.89]:
        ellipsoid((x,y*.87,.39),(.355,.065,.335),black,'Wheel well interior')
        ellipsoid((x+.18,y,.42),(.064,.083,.13),caliper,'Brake caliper')

# Tire: rounded profile with sidewall and tread groove surfaces, axle along local Y.
profile=[(-.154,.26),(-.161,.292),(-.152,.329),(-.131,.355),(-.095,.366),(.095,.366),(.131,.355),(.152,.329),(.161,.292),(.154,.26)]
for i,((y0,r0),(y1,r1)) in enumerate(zip(profile,profile[1:])):
    grid(lambda u,v,y0=y0,r0=r0,y1=y1,r1=r1:(
         (r0+(r1-r0)*v)*np.cos(u*2*np.pi),y0+(y1-y0)*v,(r0+(r1-r0)*v)*np.sin(u*2*np.pi)),
         72,2,rubber,'Rounded radial tire',wheel)
for y in [-.064,0,.064]:
    tube([(.366*np.cos(a),y,.366*np.sin(a)) for a in np.linspace(0,2*np.pi,72)],.0045,treadmat,'Tread channel',wheel)
for side in [-1,1]:
    # Barrel, diamond-cut lip, and large ventilated brake rotor.
    grid(lambda u,v,side=side:(.262*np.cos(2*np.pi*u),side*(.09+.067*v),.262*np.sin(2*np.pi*u)),
        64,2,rimdark,'Rim barrel',wheel)
    tube([(.258*np.cos(a),side*.157,.258*np.sin(a)) for a in np.linspace(0,2*np.pi,72)],.013,alloy,'Diamond cut rim lip',wheel)
    mesh=tm.creation.cylinder(radius=.217,height=.014,sections=72)
    mesh.apply_transform(tm.transformations.rotation_matrix(np.pi/2,[1,0,0]));mesh.apply_translation([0,side*.095,0])
    add(mesh,disc,'Ventilated brake rotor',wheel)
    for a in np.linspace(0,2*np.pi,24,endpoint=False):
        for r in [.162,.194]:
            # A recessed drill reads as a tiny dark disc; volume is invisible here.
            center=np.array([r*np.cos(a),side*.105,r*np.sin(a)])
            vertices=[center]+[center+np.array([.006*np.cos(t),0,.006*np.sin(t)])
                               for t in np.linspace(0,2*np.pi,8,endpoint=False)]
            add(tm.Trimesh(vertices=vertices,faces=[[0,j+1,(j+1)%8+1] for j in range(8)],process=False),
                black,'Rotor drill',wheel)
    for n in range(5):
        for split in [-1,1]:
            a=n*2*np.pi/5
            # Ten swept spokes, flat machined fronts and dark edges.
            p0=np.array([.056*np.cos(a),side*.166,.056*np.sin(a)])
            p1=np.array([.251*np.cos(a+split*.12+.10),side*.15,.251*np.sin(a+split*.12+.10)])
            pts=[]
            tangent=p1-p0
            tangent=tangent/np.linalg.norm(tangent)
            perpendicular=np.array([-tangent[2],0,tangent[0]])
            for p,w in [(p0,.026),(p1,.013)]:
                pts.extend([p-perpendicular*w,p+perpendicular*w])
            mesh=tm.Trimesh(vertices=pts,faces=[[0,1,2],[1,3,2]],process=False)
            add(mesh,alloy,'Swept forged spoke',wheel)
    ellipsoid((0,side*.169,0),(.067,.012,.067),rimdark,'Hub',wheel)
    for a in np.linspace(0,2*np.pi,5,endpoint=False):
        ellipsoid((.041*np.cos(a),side*.180,.041*np.sin(a)),(.008,.004,.008),alloy,'Wheel bolt',wheel)
    ellipsoid((0,side*.183,0),(.024,.005,.024),alloy,'Centre cap',wheel)

def write(scene,path):
    # One draw call per material, rather than one per spoke, bolt or trim segment.
    groups={}
    for mesh in scene.geometry.values():
        name=mesh.visual.material.name
        groups.setdefault(name,[]).append(mesh)
    packed=tm.Scene()
    for name,meshes in groups.items():
        merged=tm.util.concatenate(meshes)
        merged.visual=tm.visual.TextureVisuals(material=meshes[0].visual.material)
        packed.add_geometry(merged,node_name=name,geom_name=name)
    scene=packed
    # Cesium standard model correction is Rx(90) Ry(90). This inverse maps
    # author's X/Y/Z onto glTF Z/X/Y, preserving handedness and ground contact.
    conversion=np.array([[0,1,0,0],[0,0,1,0],[1,0,0,0],[0,0,0,1]],float)
    scene.apply_transform(conversion)
    blob=scene.export(file_type='glb',include_normals=True)
    # Explicit clearcoat creates the moving sky highlight that makes sheet metal read.
    json_len=struct.unpack_from('<I',blob,12)[0]
    obj=json.loads(blob[20:20+json_len])
    obj.setdefault('extensionsUsed',[]).append('KHR_materials_clearcoat')
    for mat in obj.get('materials',[]):
        if 'clearcoat' in mat.get('name',''):
            mat['extensions']={'KHR_materials_clearcoat':{'clearcoatFactor':1,'clearcoatRoughnessFactor':.17}}
        emission=mat.get('emissiveFactor',[0,0,0])
        strength=max(emission)
        if strength>1:
            mat['emissiveFactor']=[e/strength for e in emission]
            mat.setdefault('extensions',{})['KHR_materials_emissive_strength']={'emissiveStrength':strength}
            if 'KHR_materials_emissive_strength' not in obj['extensionsUsed']:
                obj['extensionsUsed'].append('KHR_materials_emissive_strength')
    obj['asset']['generator']='RoadForge GT / original parametric surfaces / scripts/make_gt.py'
    text=json.dumps(obj,separators=(',',':')).encode()
    text+=b' '*((-len(text))%4)
    binary=blob[20+json_len:]
    result=struct.pack('<4sII',b'glTF',2,12+8+len(text)+len(binary))+struct.pack('<I4s',len(text),b'JSON')+text+binary
    path.write_bytes(result)
    print(path.name,len(result),'bytes',len(obj['meshes']),'meshes')

write(car,OUT/'car.glb')
write(wheel,OUT/'wheel.glb')
