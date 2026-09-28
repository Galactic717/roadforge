import { makeVehicle, stepVehicle, DT } from './vehicle.js';
import { pilot } from './pilot.js';
import { clamp } from './route.js';

// Fixed-rate dynamics, with interpolation for displays faster/slower than 60 Hz.
export function createDrive(route, world, mission) {
  const car = makeVehicle(route);
  const start = route.at(mission.startDistance || 3);
  Object.assign(car, start, { progress: mission.startDistance || 3, speed: mission.speed ?? 10 });
  let previous = { ...car }, accumulator = 0, mode = 'pilot', paused = false;
  let ground = world.sampleGround(...route.geo(car.x, car.y), 0);
  let heightVelocity = 0, started = false;
  function update(dt, input, driving) {
    if (input.left || input.right || input.throttle || input.brake) mode = 'manual';
    if (driving && !paused) {
      accumulator += Math.min(dt, .12);
      while (accumulator >= DT) {
        previous = { ...car };
        const command = mode === 'pilot' ? pilot(car, route) : {
          steer: Number(input.left) - Number(input.right), throttle: Number(input.throttle), brake: Number(input.brake),
        };
        car.braking = command.brake > .08;
        stepVehicle(car, command, DT);
        const nearest = route.nearest(car.x, car.y, car.progress);
        car.progress = clamp(nearest.progress, car.progress - 2, car.progress + Math.max(8, car.speed * DT + 4));
        car.lateralError = nearest.distance;
        if (mode === 'pilot' && nearest.distance > 10) {
          const correction = 1 - Math.exp(-DT * .5);
          car.x += (nearest.x - car.x) * correction;
          car.y += (nearest.y - car.y) * correction;
        }
        if (route.total - car.progress < 4 && car.speed < 1.5) { car.arrived = true; car.speed = 0; }
        accumulator -= DT;
      }
    }
    const alpha = accumulator / DT;
    const x = driving && !paused ? previous.x + (car.x - previous.x) * alpha : car.x;
    const y = driving && !paused ? previous.y + (car.y - previous.y) * alpha : car.y;
    const delta = Math.atan2(Math.sin(car.heading - previous.heading), Math.cos(car.heading - previous.heading));
    const heading = driving && !paused ? previous.heading + delta * alpha : car.heading;
    const [lon, lat] = route.geo(x, y);
    const target = world.sampleGround(lon, lat, ground);
    if (!started || !driving) { ground = target; heightVelocity = 0; started = true; }
    else {
      const omega = 12, t = Math.min(dt, .1), decay = Math.exp(-omega * t);
      const change = ground - target, temp = (heightVelocity + omega * change) * t;
      ground = target + (change + temp) * decay;
      heightVelocity = (heightVelocity - omega * temp) * decay;
    }
    return { ...car, x, y, heading, lon, lat, height: ground + .025 };
  }
  return { car, update, get mode() { return mode; }, get paused() { return paused; },
    resumePilot() { mode = 'pilot'; car.arrived = false; }, togglePause() { paused = !paused; return paused; },
  };
}
