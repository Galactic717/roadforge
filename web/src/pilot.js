import { clamp, wrap } from './route.js';

export function pilot(car, route) {
  const nearest = route.nearest(car.x, car.y, car.progress);
  const lookahead = clamp(7 + car.speed * 1.1, 8, 28);
  const target = route.at(Math.min(route.total, nearest.progress + lookahead));
  const desired = Math.atan2(target.y - car.y, target.x - car.x);
  const error = wrap(desired - car.heading);
  const curvature = 2 * Math.sin(error) / Math.max(lookahead, 1);
  const steerAngle = Math.atan(2.7 * curvature);
  const next = route.at(Math.min(route.total, nearest.progress + Math.max(18, car.speed * 2.8)));
  const turn = Math.abs(wrap(next.heading - nearest.heading));
  const speedLimit = turn > 0.75 ? 5.5 : turn > 0.42 ? 8 : turn > 0.22 ? 12 : 17;
  const remaining = route.total - nearest.progress;
  const targetSpeed = Math.min(speedLimit, Math.max(0, Math.sqrt(Math.max(0, remaining - 3) * 3.8)));
  const delta = targetSpeed - car.speed;
  return { steer: clamp(steerAngle / 0.56, -1, 1), throttle: clamp(delta * 0.38 + 0.18, 0, 1), brake: clamp(-delta * 0.32, 0, 1), nearest, targetSpeed };
}
