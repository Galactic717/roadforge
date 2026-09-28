import * as C from 'cesium';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => { const x = clamp(t, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };
const logMix = (a, b, t) => Math.exp(mix(Math.log(a), Math.log(b), t));
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

// Exact critically damped response. Its time constant is independent of frame rate.
function spring(current, goal, velocity, dt, frequency) {
  const omega = frequency * 2 * Math.PI;
  const decay = Math.exp(-omega * dt);
  for (const axis of ['x', 'y', 'z']) {
    const displacement = current[axis] - goal[axis];
    const impulse = (velocity[axis] + omega * displacement) * dt;
    current[axis] = goal[axis] + (displacement + impulse) * decay;
    velocity[axis] = (velocity[axis] - omega * impulse) * decay;
  }
}

function frameAt(pose) {
  const origin = C.Cartesian3.fromDegrees(pose.lon, pose.lat, pose.height || 0);
  return { origin, matrix: C.Transforms.eastNorthUpToFixedFrame(origin) };
}

function point(frame, east, north, up) {
  return C.Matrix4.multiplyByPoint(frame.matrix, new C.Cartesian3(east, north, up), new C.Cartesian3());
}

function vector(frame, east, north, up) {
  return C.Matrix4.multiplyByPointAsVector(frame.matrix, new C.Cartesian3(east, north, up), new C.Cartesian3());
}

/**
 * One continuous camera, from an Earth portrait to a street-level chase.
 * pose.heading uses the simulation convention: east = 0, north = PI / 2.
 * The caller owns lighting, tile readiness, and holding the vehicle until t = 4.
 */
export function createDirector(viewer) {
  let elapsed = 0;
  let idleElapsed = 0;
  let active = false;
  let mode = 'chase';
  let anchor = null;
  let position = null;
  let target = null;
  let positionVelocity = new C.Cartesian3();
  let targetVelocity = new C.Cartesian3();
  let fieldOfView = C.Math.toRadians(44);
  let fieldOfViewVelocity = 0;
  const directionScratch = new C.Cartesian3();
  const rightScratch = new C.Cartesian3();
  const upScratch = new C.Cartesian3();
  const projectionScratch = new C.Cartesian3();

  function phase() {
    if (!active) return 'idle';
    if (elapsed < 2) return 'space';
    if (elapsed < 4) return 'descent';
    if (elapsed < 14) return 'drive';
    if (elapsed < 18) return 'endcard';
    return 'explore';
  }

  function state() {
    return { phase: phase(), time: elapsed, driving: active && elapsed >= 4, finished: active && elapsed >= 18 };
  }

  function groundView(pose, route, requestedMode = mode) {
    const frame = frameAt(pose);
    const speed = Math.max(0, pose.speed || 0);
    const forward = { x: Math.cos(pose.heading || 0), y: Math.sin(pose.heading || 0) };
    let turn = clamp((pose.steer || 0) * 0.8, -0.28, 0.28);
    if (route?.at && Number.isFinite(pose.x) && Number.isFinite(pose.y)) {
      const ahead = route.at((pose.progress || 0) + 17 + speed * 0.9);
      if (Math.hypot(ahead.x - pose.x, ahead.y - pose.y) > 2) {
        turn = clamp(wrap(Math.atan2(ahead.y - pose.y, ahead.x - pose.x) - (pose.heading || 0)), -0.5, 0.5) * 0.62;
      }
    }
    const lookHeading = (pose.heading || 0) + turn;
    const look = { x: Math.cos(lookHeading), y: Math.sin(lookHeading) };
    const cockpit = requestedMode === 'cockpit';
    const back = cockpit ? -0.28 : 10.8 + Math.min(speed, 28) * 0.035;
    const height = cockpit ? 1.16 : 4.1 + Math.min(speed, 28) * 0.018;
    const shoulder = cockpit ? 0.3 : 0.65 + turn * 0.65;
    const lookAhead = cockpit ? 26 + speed * 0.45 : 8.5 + Math.min(speed, 28) * 0.13;
    const lookHeight = cockpit ? 1.03 : 1.1;
    return {
      frame, forward, back, height, shoulder, lookAhead, lookHeight,
      position: point(frame, -forward.x * back - forward.y * shoulder, -forward.y * back + forward.x * shoulder, height),
      target: point(frame, look.x * lookAhead, look.y * lookAhead, lookHeight),
      right: vector(frame, forward.y, -forward.x, 0),
      fov: C.Math.toRadians(cockpit ? 67 + Math.min(speed, 32) * 0.11 : 55 + Math.min(speed, 32) * 0.24),
    };
  }

  function spaceView(pose, time, route) {
    // The whole descent stays in the destination's ENU frame. There is no flyTo
    // completion callback, change of heading convention, or camera cut at t = 4.
    const ground = groundView(pose, route, 'chase');
    const spaceDrift = smooth(time / 2);
    const zoom = smooth((time - 2) / 2);
    const height = time < 2 ? mix(18000000, 16000000, spaceDrift) : logMix(16000000, ground.height, zoom);
    const back = time < 2 ? mix(2200000, 1800000, spaceDrift) : logMix(1800000, ground.back, zoom);
    const shoulder = time < 2 ? mix(600000, 840000, spaceDrift) : ground.shoulder;
    // Let the lateral orbital drift fall away faster than altitude, keeping the
    // final approach over the actual road instead of sweeping through buildings.
    const altitudeFraction = clamp((height - ground.height) / (16000000 - ground.height), 0, 1);
    const side = time < 2 ? shoulder : ground.shoulder + (840000 - ground.shoulder) * altitudeFraction ** 1.2;
    const p = point(ground.frame, -ground.forward.x * back - ground.forward.y * side, -ground.forward.y * back + ground.forward.x * side, height);
    const radius = C.Cartesian3.magnitude(ground.frame.origin);
    const centerBias = h => radius * (h / (h + 1000000)) ** 2;
    const centerDepth = Math.max(0, centerBias(height) - centerBias(ground.height));
    const targetPoint = C.Cartesian3.clone(ground.target);
    const downward = vector(ground.frame, 0, 0, -centerDepth);
    C.Cartesian3.add(targetPoint, downward, targetPoint);
    return { ...ground, position: p, target: targetPoint, fov: mix(C.Math.toRadians(44), ground.fov, zoom) };
  }

  function present(view) {
    C.Cartesian3.subtract(target, position, directionScratch);
    if (C.Cartesian3.magnitudeSquared(directionScratch) < 0.0001) return;
    C.Cartesian3.normalize(directionScratch, directionScratch);
    // Project the ENU right vector onto the view plane. Geodetic "up" alone
    // becomes singular when an orbital camera looks vertically at the ground.
    C.Cartesian3.multiplyByScalar(directionScratch, C.Cartesian3.dot(view.right, directionScratch), projectionScratch);
    C.Cartesian3.subtract(view.right, projectionScratch, rightScratch);
    C.Cartesian3.normalize(rightScratch, rightScratch);
    C.Cartesian3.cross(rightScratch, directionScratch, upScratch);
    C.Cartesian3.normalize(upScratch, upScratch);
    viewer.camera.setView({ destination: position, orientation: { direction: directionScratch, up: upScratch } });
    viewer.camera.frustum.fov = fieldOfView;
    viewer.scene.requestRender();
  }

  function snap(view) {
    position = C.Cartesian3.clone(view.position);
    target = C.Cartesian3.clone(view.target);
    positionVelocity = new C.Cartesian3();
    targetVelocity = new C.Cartesian3();
    fieldOfView = view.fov;
    fieldOfViewVelocity = 0;
    present(view);
  }

  const director = {
    start(mission, pose, options = {}) {
      viewer.camera.cancelFlight();
      viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
      anchor = { lon: mission?.origin?.[0] ?? 30.5234, lat: mission?.origin?.[1] ?? 50.4501, height: 0, heading: 0, speed: 0, ...pose };
      elapsed = options.intro === false ? 4 : 0;
      active = true;
      snap(elapsed < 4 ? spaceView(anchor, 0) : groundView(anchor));
      return state();
    },

    update(dt, pose, route) {
      if (!active || !pose) return state();
      const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.5);
      const previousTime = elapsed;
      elapsed += step;
      if (elapsed < 4) {
        snap(spaceView(anchor, elapsed, route));
      } else {
        const view = groundView(pose, route);
        if (previousTime < 4 || !position || !target) {
          snap(view);
        } else {
          spring(position, view.position, positionVelocity, step, mode === 'cockpit' ? 5.5 : 1.85);
          spring(target, view.target, targetVelocity, step, mode === 'cockpit' ? 6.5 : 2.15);
          const omega = 2 * Math.PI * 0.8;
          const delta = fieldOfView - view.fov;
          const impulse = (fieldOfViewVelocity + omega * delta) * step;
          const decay = Math.exp(-omega * step);
          fieldOfView = view.fov + (delta + impulse) * decay;
          fieldOfViewVelocity = (fieldOfViewVelocity - omega * impulse) * decay;
          present(view);
        }
      }
      return state();
    },

    setMode(next) {
      const normalized = String(next).toLowerCase();
      if (!['chase', 'cockpit'].includes(normalized) || normalized === mode) return mode;
      mode = normalized;
      // A clean lens cut avoids dragging the eye through the car's rear shell.
      position = null;
      target = null;
      return mode;
    },

    frame(pose, route) {
      snap(groundView(pose, route));
    },

    idle(dt = 0) {
      if (active) return state();
      idleElapsed += Math.max(0, Number.isFinite(dt) ? dt : 0);
      const pose = { lon: 24 + Math.sin(idleElapsed / 80) * 4, lat: 29, height: 0, heading: Math.PI / 2, speed: 0 };
      snap(spaceView(pose, 0));
      return state();
    },

    reset() {
      active = false;
      elapsed = 0;
      position = null;
      target = null;
      return state();
    },

    get elapsed() { return elapsed; },
    get phase() { return phase(); },
    get mode() { return mode; },
  };
  return director;
}
