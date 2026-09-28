import { createGlobe } from './globe.js';
import { createDirector } from './camera.js';
import { createCar } from './car.js';
import { createDrive } from './drive.js';
import { createUI } from './ui.js';
import { missions } from './missions.js';
import { cachedMission } from './route.js';
import { loadKeys } from './keys.js';
import { buildCustomRoute } from './search.js';
import '../style.css';

const world = createGlobe(loadKeys());
const director = createDirector(world.viewer);
let active = null, drive = null, car = null, route = null, pose = null;
let loading = false, generation = 0, last = performance.now(), mode = 'chase', lastInfo = 0;
const ui = createUI(missions, {
  start, home, custom,
  capture() { start(active || missions[0], true, active?.id === 'custom' ? route : null); },
  camera() { mode = mode === 'chase' ? 'cockpit' : 'chase'; director.setMode(mode); ui.camera(mode); },
  pilot() { drive?.resumePilot(); ui.pilot('pilot'); },
  pause() { if (drive) ui.pause(drive.togglePause()); },
});

async function custom(query) {
  const ticket = ++generation;
  loading = true; ui.routeBusy(true); ui.loading(true, 'Будую маршрут…');
  try {
    await world.ready;
    const result = await buildCustomRoute(query, loadKeys().mapbox, message => ui.loading(true, message), world.geocode);
    if (ticket !== generation) return;
    await start(result.mission, false, result.route);
  } catch (error) {
    if (ticket !== generation) return;
    loading = false; ui.loading(false); ui.routeBusy(false, error.message);
  } finally { ui.routeBusy(false); }
}

async function start(mission, capture = false, suppliedRoute = null) {
  const ticket = ++generation;
  loading = true;
  ui.loading(true, `Finding the road in ${mission.title}…`);
  ui.setCapture(capture);
  car?.destroy(); car = null; drive = null;
  try {
    await world.ready;
    const next = suppliedRoute || await cachedMission(mission.id);
    if (ticket !== generation) return;
    route = next;
    await world.prepareRoute(route, mission);
    if (ticket !== generation) return;
    active = mission;
    drive = createDrive(route, world, mission);
    pose = drive.update(0, ui.input, false);
    car = createCar(world.viewer); car.update(pose, 0);
    mode = 'chase'; director.setMode(mode); ui.camera(mode); ui.pause(false); ui.pilot('pilot');
    director.frame?.(pose, route);
    await new Promise(resolve => setTimeout(resolve, 500));
    if (ticket !== generation) return;
    ui.mission(mission);
    world.setIntro(true);
    director.start(mission, pose);
    loading = false; ui.loading(false);
    const params = new URLSearchParams(mission.query ? { route: mission.query } : { city: mission.id });
    if (capture) params.set('capture', '1');
    history.replaceState(null, '', `#${params}`);
    updateWorldLabel();
  } catch (error) {
    if (ticket !== generation) return;
    loading = false; ui.loading(false); ui.setCapture(false);
    ui.notice(`The road could not load. ${error.message}`);
  }
}
function home() {
  ++generation; loading = false; car?.destroy(); car = null; drive = null; active = null;
  director.reset(); ui.loading(false); ui.idle(); world.setIntro(true);
  history.replaceState(null, '', location.pathname);
}
function updateWorldLabel() {
  const status = world.status;
  const type = typeof status === 'string' ? status : status?.mode || status?.provider || '';
  const google = /google|photoreal/i.test(type);
  const plateau = /plateau|tokyo/i.test(type);
  ui.world(google ? 'GOOGLE 3D EARTH' : plateau ? 'TOKYO IN 3D' : 'THE REAL EARTH',
    google ? 'Google Photorealistic 3D Tiles are enabled. Choose a city, then press R for a clean replay.' :
    'Tokyo uses Japan’s open PLATEAU textured 3D city. Add a Cesium ion token with Google Photorealistic 3D Tiles enabled for other cities. Keys stay in this browser.');
}
function frame(now) {
  const dt = Math.min((now - last) / 1000, .1); last = now;
  if (!loading && drive && pose) {
    const moving = director.elapsed >= 4;
    pose = drive.update(dt, ui.input, moving);
    car.update(pose, drive.paused ? 0 : dt);
    const state = director.update(drive.paused && moving ? 0 : dt, pose, route);
    world.setIntro(state.time < 3.6);
    ui.frame(state); ui.pilot(drive.mode);
    if (active?.id === 'custom' && now - lastInfo > 500) {
      const distance = Math.max(0, (route.meta.distance || route.total) * (1 - pose.progress / route.total));
      ui.progress(drive.car.arrived ? 'Ви на місці' : `${distance > 1000 ? `${Math.round(distance / 1000).toLocaleString('uk-UA')} км` : `${Math.round(distance)} м`} до цілі · ${Math.round(pose.speed * 3.6)} км/год`);
      lastInfo = now;
    }
  } else if (!loading) director.idle(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
world.ready.then(updateWorldLabel).catch(() => ui.notice('Some world data could not load. Try a city again.'));
const params = new URLSearchParams(location.hash.slice(1));
const incoming = missions.find(m => m.id === (params.get('city') || params.get('mission')));
if (incoming) start(incoming, params.get('capture') === '1');
else if (params.has('route')) { ui.routeQuery(params.get('route')); custom(params.get('route')); }

// Read-only scene state for capture tools and browser verification, never credentials.
window.roadforge = {
  get state() { return { loading, city: active?.id, phase: director.phase, elapsed: director.elapsed,
    pose: pose && { ...pose }, camera: mode, mode: drive?.mode, paused: drive?.paused, world: world.status,
    route: route && { distance: route.meta.distance || route.total, points: route.coordinates.length, from: route.coordinates[0], to: route.coordinates.at(-1), title: active?.title } }; },
};
