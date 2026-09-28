# RoadForge GT

Original parametric vehicle created for RoadForge. No downloaded models,
manufacturer trademarks, textures, or third-party geometry are used.

The model assets `car.glb` and `wheel.glb` and their source
`scripts/make_gt.py` are dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Regenerate with Python 3, numpy and trimesh: `python scripts/make_gt.py`.

The body is about 1.72 MB / 69,312 triangles; the shared wheel asset is
about 0.32 MB / 11,512 triangles, reused at all four corners. Geometry is
merged by material (12 body primitives and 6 per wheel). Optional visual
QA: start Vite on port 5191 and run `node scripts/car-preview.mjs`; it
captures front/rear images in `docs/` and removes its temporary test page.

The GT has continuous curved body panels, actual wheel-arch openings, a
fastback glasshouse, mirrors, shut-lines, machined split-spoke alloys,
drilled rotors, tire channels, LED lamps, grille louvres, a rear diffuser,
seats, dashboard and steering wheel. PBR titanium paint uses clearcoat.

Dimensions: 4.83 m long, 2.30 m including mirrors, 1.35 m tall. Ground is
z=0 in authoring space. Wheel centres are x=-1.40/+1.42, y=±0.88, z=0.366;
wheel radius is 0.366 m. Wheel geometry is centred on its own axle.

Authoring axes are +X forward, +Y left, +Z up. The glTF coordinates are
X=left, Y=up, Z=forward, giving exactly those authoring axes after Cesium's
standard glTF axis correction. The car renderer consequently uses the
physics heading directly: east=0, north=π/2.

Cabin eye: forward x=0.28 m, lateral y=0.30 m, height z=1.16 m.
