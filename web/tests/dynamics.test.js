import test from 'node:test';
import assert from 'node:assert/strict';
import { Route } from '../src/route.js';
import { makeVehicle, stepVehicle } from '../src/vehicle.js';
import { pilot } from '../src/pilot.js';

const road = new Route([[0, 0], [.01, 0], [.02, 0]]);

test('bicycle model accelerates, brakes, and turns in steer direction', () => {
  const car = makeVehicle(road);
  for (let i = 0; i < 120; i++) stepVehicle(car, { throttle: 1, steer: 0 }, 1 / 60);
  const speed = car.speed;
  assert.ok(speed > 5);
  for (let i = 0; i < 60; i++) stepVehicle(car, { throttle: 0, brake: 1, steer: 1 }, 1 / 60);
  assert.ok(car.speed < speed);
  assert.ok(car.heading > 0);
});

test('pilot steers toward the route from each side', () => {
  const car = makeVehicle(road);
  car.speed = 8;
  car.y = 6;
  assert.ok(pilot(car, road).steer < 0);
  car.y = -6;
  assert.ok(pilot(car, road).steer > 0);
});

test('route progress and destination are metric and ordered', () => {
  assert.ok(road.total > 2000 && road.total < 2300);
  const a = road.nearest(120, 2, 0), b = road.nearest(420, 1, a.progress);
  assert.ok(b.progress > a.progress);
  assert.ok(b.distance < 2);
  assert.ok(Math.abs(road.at(road.total).x - road.points.at(-1).x) < .01);
});
