import * as C from 'cesium';

// Original GT asset is authored in metres. Cesium's standard glTF axis correction
// gives +X forward, +Y left, +Z up. Physics heading is east=0, north=PI/2.
const WHEEL_RADIUS = .366;
const MODEL_ROOT = `${import.meta.env.BASE_URL}models/`;

function contactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = 192; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(96, 64, 9, 96, 64, 62);
  gradient.addColorStop(0, 'rgba(0,0,0,.55)');
  gradient.addColorStop(.50, 'rgba(0,0,0,.34)');
  gradient.addColorStop(.82, 'rgba(0,0,0,.13)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 192, 128);
  return canvas;
}

/** Create the car once, then update it with a ground-level WGS84 pose every frame. */
export function createCar(viewer) {
  const entities = [];
  let visible = true, spin = 0, destroyed = false;
  const start = C.Cartesian3.fromDegrees(0, 0, 0);
  const add = config => {
    const entity = viewer.entities.add(config);
    entities.push(entity);
    return entity;
  };
  const model = file => ({
    uri: `${MODEL_ROOT}${file}`, scale: 1,
    minimumPixelSize: 0, maximumScale: 1,
    shadows: C.ShadowMode.ENABLED,
    imageBasedLightingFactor: new C.Cartesian2(1, 1),
    runAnimations: false,
  });
  const body = add({ name: 'RoadForge GT', position: start, orientation: C.Quaternion.IDENTITY, model: model('car.glb') });
  const wheels = [];
  for (const x of [-1.40, 1.42]) for (const y of [-.88, .88]) {
    wheels.push({ x, y, entity: add({ name: 'Forged alloy wheel', position: start,
      orientation: C.Quaternion.IDENTITY, model: model('wheel.glb') }) });
  }
  const shadow = add({ name: 'Contact shadow', position: start,
    ellipse: { semiMajorAxis: 2.70, semiMinorAxis: 1.16,
      height: .018, material: new C.ImageMaterialProperty({ image: contactShadow(),
        color: C.Color.BLACK.withAlpha(.8), transparent: true }) } });
  const brakeLamps = [-1, 1].map(side => add({ name: 'Brake lamp', position: start,
    orientation: C.Quaternion.IDENTITY, show: false,
    box: { dimensions: new C.Cartesian3(.013, .60, .016),
      material: new C.ColorMaterialProperty(C.Color.fromCssColorString('#ff2418')) } }));

  const enu = new C.Matrix4(), enuRotation = new C.Matrix3(), localRotation = new C.Matrix3();
  const worldRotation = new C.Matrix3(), orientation = new C.Quaternion();
  const steering = new C.Quaternion(), rolling = new C.Quaternion(), localWheel = new C.Quaternion();
  const offset = new C.Cartesian3(), worldOffset = new C.Cartesian3();

  function update(pose, dt = 1 / 60) {
    if (destroyed || !pose || !Number.isFinite(pose.lon) || !Number.isFinite(pose.lat)) return;
    const height = Number.isFinite(pose.height) ? pose.height : 0;
    const base = C.Cartesian3.fromDegrees(pose.lon, pose.lat, height);
    C.Transforms.eastNorthUpToFixedFrame(base, undefined, enu);
    C.Matrix4.getMatrix3(enu, enuRotation);
    C.Matrix3.fromRotationZ(pose.heading || 0, localRotation);
    C.Matrix3.multiply(enuRotation, localRotation, worldRotation);
    C.Quaternion.fromRotationMatrix(worldRotation, orientation);
    body.position = base;
    body.orientation = orientation;
    spin = Number.isFinite(pose.wheelAngle) ? pose.wheelAngle :
      (spin + (pose.speed || 0) * Math.min(dt, .1) / WHEEL_RADIUS) % (Math.PI * 2);
    function position(x, y, z) {
      offset.x = x; offset.y = y; offset.z = z;
      C.Matrix3.multiplyByVector(worldRotation, offset, worldOffset);
      return C.Cartesian3.add(base, worldOffset, new C.Cartesian3());
    }
    for (const wheel of wheels) {
      wheel.entity.position = position(wheel.x, wheel.y, WHEEL_RADIUS);
      C.Quaternion.fromAxisAngle(C.Cartesian3.UNIT_Z, wheel.x > 0 ? pose.steer || 0 : 0, steering);
      C.Quaternion.fromAxisAngle(C.Cartesian3.UNIT_Y, spin, rolling);
      C.Quaternion.multiply(steering, rolling, localWheel);
      wheel.entity.orientation = C.Quaternion.multiply(orientation, localWheel, new C.Quaternion());
    }
    shadow.position = base;
    shadow.ellipse.height = height + .018;
    shadow.ellipse.rotation = (pose.heading || 0) - Math.PI / 2;
    shadow.ellipse.stRotation = (pose.heading || 0) - Math.PI / 2;
    for (let i = 0; i < brakeLamps.length; i++) {
      const lamp = brakeLamps[i];
      lamp.position = position(-2.422, (i === 0 ? -1 : 1) * .40, .632);
      lamp.orientation = orientation;
      lamp.show = visible && !!pose.braking;
    }
  }

  return {
    entities, update,
    setVisible(value) {
      visible = !!value;
      for (const entity of entities) entity.show = visible;
      for (const lamp of brakeLamps) lamp.show = false;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const entity of entities) viewer.entities.remove(entity);
    },
  };
}
