import { clamp, wrap } from './route.js';

export const DT = 1 / 60;
export function makeVehicle(route) {
  const start = route.at(2);
  return { x: start.x, y: start.y, heading: start.heading, speed: 0, steer: 0, progress: 0, lateralError: 0, grade: 0, height: 0, arrived: false };
}
export function stepVehicle(car, input, dt = DT) {
  const targetSteer = clamp(input.steer || 0, -1, 1) * 0.56;
  const steerRate = (0.9 + 0.025 * car.speed) * dt;
  car.steer += clamp(targetSteer - car.steer, -steerRate, steerRate);
  const acceleration = (input.throttle || 0) * 4.3 - (input.brake || 0) * 10.5 - 0.14 - car.speed * 0.015 - car.speed * car.speed * 0.0014;
  car.speed = clamp(car.speed + acceleration * dt, 0, 32);
  const wheelbase = 2.7;
  car.heading = wrap(car.heading + car.speed / wheelbase * Math.tan(car.steer) * dt);
  car.x += Math.cos(car.heading) * car.speed * dt;
  car.y += Math.sin(car.heading) * car.speed * dt;
  return car;
}
