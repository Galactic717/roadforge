import * as C from 'cesium';
import { missions } from './missions.js';
import { Route, requestRoute, cachedMission, geocode, clamp, wrap } from './route.js';
import { makeVehicle, stepVehicle, DT } from './vehicle.js';
import { pilot } from './pilot.js';
import { loadKeys, saveKeys } from './keys.js';
import '../style.css';

const $ = id => document.getElementById(id);
document.body.classList.add('idle');
const keys = loadKeys();
if (keys.cesium) C.Ion.defaultAccessToken = keys.cesium;
const quality = localStorage.getItem('roadforge.quality') || 'performance';
const viewer = new C.Viewer('globe', {
  baseLayer: false, terrainProvider: new C.EllipsoidTerrainProvider(),
  animation: false, timeline: false, geocoder: false, homeButton: false,
  navigationHelpButton: false, baseLayerPicker: false, sceneModePicker: false,
  fullscreenButton: false, infoBox: false, selectionIndicator: false,
  shouldAnimate: true, requestRenderMode: false,
});
viewer.scene.globe.baseColor = C.Color.fromCssColorString('#15232c');
viewer.scene.globe.depthTestAgainstTerrain = true;
viewer.scene.globe.enableLighting = quality === 'cinematic';
viewer.scene.fog.enabled = true;
viewer.scene.skyAtmosphere.show = true;
viewer.scene.highDynamicRange = quality === 'cinematic';
viewer.resolutionScale = quality === 'cinematic' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 1);
viewer.scene.globe.maximumScreenSpaceError = quality === 'cinematic' ? 2 : 5;
viewer.camera.flyTo({ destination: C.Cartesian3.fromDegrees(31.2, 48.9, 3700000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 }, duration: 0 });

async function bootImagery() {
  try {
    const esri = await C.ArcGisMapServerImageryProvider.fromUrl('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer');
    viewer.imageryLayers.addImageryProvider(esri);
  } catch (error) {
    console.warn('Esri imagery unavailable, using OSM', error);
    viewer.imageryLayers.addImageryProvider(new C.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }));
    notice('Satellite imagery unavailable · OpenStreetMap fallback');
  }
}
bootImagery();
if (keys.cesium) {
  C.createWorldTerrainAsync().then(terrain => { viewer.terrainProvider = terrain; }).catch(error => console.warn('World terrain unavailable', error));
  if (quality === 'cinematic') C.createGooglePhotorealistic3DTileset().then(tileset => {
    tileset.maximumScreenSpaceError = 16;
    viewer.scene.primitives.add(tileset);
    $('world-status').innerHTML = '<i></i> 3D TILES LIVE';
  }).catch(error => console.warn('Google 3D Tiles unavailable for this token', error));
}

let route = null, car = null, carBody = null, wheels = [], lights = [], shadow = null, routeUnder = null, routeGlow = null;
let mode = 'PILOT', cameraMode = 'GOD', paused = false, missionName = 'EARTH', lastFrame = performance.now(), accumulator = 0;
let cameraPosition = null, cameraTarget = null, cameraVelocity = new C.Cartesian3(), targetVelocity = new C.Cartesian3(), wheelAngle = 0, previousHeight = 0, lastHeightPose = null, lastHud = 0, lastBevTile = '';
let lastPlaceProgress = 0, placeRequestPending = false;
let selected = { origin: missions[0].origin, destination: null };
const keydown = new Set();
const mobile = { left: false, right: false, throttle: false, brake: false };
const cameraModes = ['GOD', 'CHASE', 'COCKPIT'];
const ENU_X = new C.Cartesian3(), ENU_Y = new C.Cartesian3(), ENU_Z = new C.Cartesian3();
let noticeTimer;
function notice(message) { const el = $('notice'); el.textContent = message; el.classList.add('show'); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => el.classList.remove('show'), 4300); }

function makeOrientation(lon, lat, heading) {
  const center = C.Cartesian3.fromDegrees(lon, lat, 0);
  const enu = C.Transforms.eastNorthUpToFixedFrame(center);
  const rotation = C.Matrix4.getMatrix3(enu, new C.Matrix3());
  // Cesium's glTF local forward is +Y after its up-axis conversion.
  const turn = C.Matrix3.fromRotationZ(heading - Math.PI / 2);
  return C.Quaternion.fromRotationMatrix(C.Matrix3.multiply(rotation, turn, new C.Matrix3()));
}
function worldPoint(lon, lat, height, east = 0, north = 0, up = 0) {
  const center = C.Cartesian3.fromDegrees(lon, lat, height);
  const frame = C.Transforms.eastNorthUpToFixedFrame(center);
  const p = C.Matrix4.multiplyByPoint(frame, new C.Cartesian3(east, north, up), new C.Cartesian3());
  return p;
}
function carParts() {
  carBody = viewer.entities.add({ position: C.Cartesian3.fromDegrees(0, 0), orientation: C.Quaternion.IDENTITY,
    model: { uri: '/models/car.glb', minimumPixelSize: 32, maximumScale: 3, shadows: C.ShadowMode.ENABLED } });
  for (const x of [-1.43, 1.45]) for (const y of [-.79, .79]) wheels.push({ x, y,
    entity: viewer.entities.add({ position: C.Cartesian3.fromDegrees(0, 0), orientation: C.Quaternion.IDENTITY,
      model: { uri: '/models/wheel.glb', minimumPixelSize: 9, maximumScale: 3, shadows: C.ShadowMode.ENABLED } }) });
  shadow = viewer.entities.add({ position: C.Cartesian3.fromDegrees(0, 0), ellipse: { semiMajorAxis: 2.75, semiMinorAxis: 1.28, material: C.Color.BLACK.withAlpha(.27), height: .02 } });
  for (const front of [true, false]) for (const side of [-.62, .62]) lights.push({ front, side,
    entity: viewer.entities.add({ position: C.Cartesian3.fromDegrees(0, 0), point: {
      pixelSize: front ? 5 : 6, color: front ? C.Color.fromCssColorString('#d9f5ff') : C.Color.fromCssColorString('#ff4747'),
      outlineColor: front ? C.Color.fromCssColorString('#7ee8ff') : C.Color.fromCssColorString('#ff4747'), outlineWidth: 2,
      show: false, disableDepthTestDistance: 50,
    } }) });
}
function destroyDrive() {
  for (const entity of [carBody, shadow, routeUnder, routeGlow, ...wheels.map(w => w.entity), ...lights.map(l => l.entity)]) if (entity) viewer.entities.remove(entity);
  carBody = shadow = routeUnder = routeGlow = null; wheels = []; lights = []; car = null; route = null;
}
function solarElevation(date, lon, lat) {
  const day = (date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000;
  const gamma = 2 * Math.PI / 365 * (day - 1 + (date.getUTCHours() - 12) / 24);
  const decl = .006918 - .399912 * Math.cos(gamma) + .070257 * Math.sin(gamma) - .006758 * Math.cos(2 * gamma) + .000907 * Math.sin(2 * gamma) - .002697 * Math.cos(3 * gamma) + .00148 * Math.sin(3 * gamma);
  const eq = 229.18 * (.000075 + .001868 * Math.cos(gamma) - .032077 * Math.sin(gamma) - .014615 * Math.cos(2 * gamma) - .040849 * Math.sin(2 * gamma));
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const hourAngle = (minutes + eq + 4 * lon) / 4 * Math.PI / 180 - Math.PI;
  const phi = lat * Math.PI / 180;
  return Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle)) * 180 / Math.PI;
}
function renderCar() {
  if (!car || !route) return;
  const [lon, lat] = route.geo(car.x, car.y);
  const cartographic = C.Cartographic.fromDegrees(lon, lat);
  let terrainHeight = keys.cesium ? viewer.scene.globe.getHeight(cartographic) : 0;
  if (!Number.isFinite(terrainHeight) || terrainHeight < -100 || terrainHeight > 6000) terrainHeight = 0;
  if (Math.abs(terrainHeight - previousHeight) > 50 && car.speed > 0) terrainHeight = previousHeight;
  previousHeight += (terrainHeight - previousHeight) * .12;
  car.height = previousHeight;
  if (lastHeightPose) {
    const distance = Math.hypot(car.x - lastHeightPose.x, car.y - lastHeightPose.y);
    if (distance > .25) car.grade += (Math.atan2(car.height - lastHeightPose.height, distance) * 180 / Math.PI - car.grade) * .1;
  }
  lastHeightPose = { x: car.x, y: car.y, height: car.height };
  const base = worldPoint(lon, lat, car.height + .06);
  const orientation = makeOrientation(lon, lat, car.heading);
  carBody.position = base; carBody.orientation = orientation;
  shadow.position = worldPoint(lon, lat, car.height + .01);
  for (const wheel of wheels) {
    const east = Math.cos(car.heading) * wheel.x - Math.sin(car.heading) * wheel.y;
    const north = Math.sin(car.heading) * wheel.x + Math.cos(car.heading) * wheel.y;
    wheel.entity.position = worldPoint(lon, lat, car.height, east, north, .41);
    const spin = C.Quaternion.fromAxisAngle(C.Cartesian3.UNIT_Y, wheelAngle);
    const steer = C.Quaternion.fromAxisAngle(C.Cartesian3.UNIT_Z, wheel.x > 0 ? car.steer : 0);
    wheel.entity.orientation = C.Quaternion.multiply(orientation, C.Quaternion.multiply(steer, spin, new C.Quaternion()), new C.Quaternion());
  }
  const night = solarElevation(new Date(), lon, lat) < -3;
  for (const light of lights) {
    const x = light.front ? 2.29 : -2.34, y = light.side;
    const east = Math.cos(car.heading) * x - Math.sin(car.heading) * y;
    const north = Math.sin(car.heading) * x + Math.cos(car.heading) * y;
    light.entity.position = worldPoint(lon, lat, car.height, east, north, .67);
    light.entity.point.show = light.front ? night : night || car.braking || car.arrived;
  }
}
function addRouteVisual() {
  const positions = C.Cartesian3.fromDegreesArray(route.coordinates.flat());
  routeUnder = viewer.entities.add({ polyline: { positions, clampToGround: true, width: 8, material: C.Color.fromCssColorString('#07151b').withAlpha(.85) } });
  routeGlow = viewer.entities.add({ polyline: { positions: new C.CallbackProperty(() => {
    if (!car || !route) return positions.slice(0, 2);
    const end = Math.min(route.points.length - 1, route.indexAt(car.progress + 450) + 2);
    return positions.slice(0, end + 1);
  }, false), clampToGround: true, width: 4, material: new C.PolylineGlowMaterialProperty({ glowPower: .18, color: C.Color.fromCssColorString('#7ee8ff').withAlpha(.9) }) } });
}
async function beginDrive(nextRoute, title, destinationLabel) {
  destroyDrive(); route = nextRoute; car = makeVehicle(route); missionName = title;
  document.body.classList.remove('idle');
  mode = 'PILOT'; paused = false; wheelAngle = 0; previousHeight = 0; lastHeightPose = null; lastPlaceProgress = 0; placeRequestPending = false; cameraPosition = null; cameraTarget = null; cameraVelocity = new C.Cartesian3(); targetVelocity = new C.Cartesian3();
  carParts(); addRouteVisual(); renderCar(); updateModeUI();
  $('place').textContent = title;
  $('route-source').textContent = route.meta.source?.replace(' public route cache', '') || 'OSRM';
  $('destination').value = destinationLabel || $('destination').value;
  const [lon, lat] = route.coordinates[0];
  const center = C.Cartesian3.fromDegrees(lon, lat, 2400);
  viewer.camera.flyTo({ destination: center, orientation: { heading: 0, pitch: -.85, roll: 0 }, duration: 1.7, complete: () => { cameraPosition = C.Cartesian3.clone(viewer.camera.position); cameraTarget = null; } });
  notice(`PILOT ACTIVE · ${Math.round(route.total / 1000 * 10) / 10} KM`);
  writeHash();
}
async function startMission(mission) {
  document.querySelectorAll('.missions button').forEach(button => button.classList.toggle('selected', button.dataset.mission === mission.id));
  $('origin').value = mission.subtitle.split(' → ')[0]; $('destination').value = mission.subtitle.split(' → ')[1];
  selected = { origin: mission.origin, destination: mission.destination };
  try { await beginDrive(await cachedMission(mission.id), mission.place, $('destination').value); }
  catch (error) { notice(`Preset unavailable: ${error.message}`); }
}
function writeHash() {
  if (!route) return;
  const params = new URLSearchParams({ camera: cameraMode });
  const mission = missions.find(m => m.place === missionName);
  if (mission) params.set('mission', mission.id);
  else { params.set('from', selected.origin.join(',')); params.set('to', selected.destination.join(',')); }
  history.replaceState(null, '', `#${params}`);
}
function setCamera(modeName) {
  cameraMode = modeName;
  document.body.dataset.camera = modeName.toLowerCase();
  document.querySelectorAll('[data-camera]').forEach(button => button.classList.toggle('active', button.dataset.camera === modeName));
  writeHash();
}
function springCartesian(current, goal, velocity, dt, frequency) {
  const omega = 2 * Math.PI * frequency, decay = Math.exp(-omega * dt);
  for (const axis of ['x', 'y', 'z']) {
    const change = current[axis] - goal[axis];
    const temp = (velocity[axis] + omega * change) * dt;
    current[axis] = goal[axis] + (change + temp) * decay;
    velocity[axis] = (velocity[axis] - omega * temp) * decay;
  }
}
function cameraTick(dt) {
  if (!car || !route || viewer.camera._currentFlight) return;
  const [lon, lat] = route.geo(car.x, car.y);
  const f = { x: Math.cos(car.heading), y: Math.sin(car.heading) };
  let cam, target;
  if (cameraMode === 'GOD') {
    const follow = car.arrived ? 165 : 90, altitude = car.arrived ? 175 : 92;
    cam = worldPoint(lon, lat, car.height, -f.x * follow - f.y * 20, -f.y * follow + f.x * 20, altitude);
    target = worldPoint(lon, lat, car.height, f.x * 13, f.y * 13, 0);
  } else if (cameraMode === 'CHASE') {
    cam = worldPoint(lon, lat, car.height, -f.x * 13 - f.y * car.steer * 3, -f.y * 13 + f.x * car.steer * 3, 5.2);
    target = worldPoint(lon, lat, car.height, f.x * 10, f.y * 10, 1.5);
  } else {
    cam = worldPoint(lon, lat, car.height, f.x * .55, f.y * .55, 1.43);
    target = worldPoint(lon, lat, car.height, f.x * 55, f.y * 55, .8);
  }
  if (!cameraPosition) cameraPosition = C.Cartesian3.clone(viewer.camera.position);
  if (!cameraTarget) cameraTarget = C.Cartesian3.clone(target);
  springCartesian(cameraPosition, cam, cameraVelocity, dt, cameraMode === 'GOD' ? .46 : .75);
  springCartesian(cameraTarget, target, targetVelocity, dt, cameraMode === 'GOD' ? .63 : .9);
  const direction = C.Cartesian3.normalize(C.Cartesian3.subtract(cameraTarget, cameraPosition, new C.Cartesian3()), new C.Cartesian3());
  const up = C.Ellipsoid.WGS84.geodeticSurfaceNormal(cameraPosition, new C.Cartesian3());
  viewer.camera.setView({ destination: cameraPosition, orientation: { direction, up } });
  viewer.camera.frustum.fov = C.Math.toRadians(cameraMode === 'GOD' ? 49 : cameraMode === 'CHASE' ? 60 + car.speed * .23 : 68 + car.speed * .14);
}
function updateModeUI() {
  $('driver-label').textContent = mode;
  $('telemetry-mode').textContent = mode;
  $('driver-toggle').classList.toggle('manual', mode === 'MANUAL');
  $('pause-toggle').textContent = paused ? '▶' : 'Ⅱ';
}
function controlInput() {
  const left = keydown.has('a') || keydown.has('arrowleft') || mobile.left;
  const right = keydown.has('d') || keydown.has('arrowright') || mobile.right;
  const throttle = keydown.has('w') || keydown.has('arrowup') || mobile.throttle;
  const brake = keydown.has('s') || keydown.has('arrowdown') || mobile.brake;
  if (left || right || throttle || brake) { if (mode !== 'MANUAL') { mode = 'MANUAL'; updateModeUI(); notice('MANUAL CONTROL'); } }
  return { steer: Number(left) - Number(right), throttle: Number(throttle), brake: Number(brake) };
}
function driveTick() {
  if (!car || !route || paused || car.arrived) return;
  const manual = controlInput();
  const command = mode === 'PILOT' ? pilot(car, route) : manual;
  car.braking = command.brake > .08;
  stepVehicle(car, command, DT);
  const nearest = route.nearest(car.x, car.y, car.progress);
  car.progress = Math.max(car.progress, Math.min(nearest.progress, car.progress + Math.max(8, car.speed * DT + 4)));
  car.lateralError = nearest.distance;
  wheelAngle -= car.speed * DT / .39;
  if (nearest.distance > 18 && mode === 'PILOT') {
    const onRoute = route.at(car.progress);
    car.x += (onRoute.x - car.x) * .035; car.y += (onRoute.y - car.y) * .035;
    if (nearest.distance > 45) notice('REACQUIRING ROUTE');
  } else if (nearest.distance > 35 && mode === 'MANUAL') notice('OFF ROUTE · PRESS P FOR PILOT');
  if (route.total - car.progress < 4 && car.speed < 1.8) { car.arrived = true; car.speed = 0; setCamera('GOD'); notice('ARRIVED · ROUTE COMPLETE'); }
  renderCar();
}
function updateHud() {
  if (!car || !route) return;
  const [lon, lat] = route.geo(car.x, car.y);
  if (car.progress - lastPlaceProgress > 1800 && !placeRequestPending) {
    lastPlaceProgress = car.progress; placeRequestPending = true;
    const activeRoute = route;
    const endpoint = keys.mapbox
      ? `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?types=address,place,locality&limit=1&access_token=${encodeURIComponent(keys.mapbox)}`
      : `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=17`;
    fetch(endpoint).then(response => response.json()).then(data => {
      if (route !== activeRoute) return;
      if (keys.mapbox) $('place').textContent = data.features?.[0]?.place_name?.split(',').slice(0, 2).join(' · ') || missionName;
      else { const address = data.address || {}; $('place').textContent = [address.city || address.town || address.village || missionName, address.road || address.suburb].filter(Boolean).join(' · '); }
    }).catch(() => {}).finally(() => { placeRequestPending = false; });
  }
  $('speed').textContent = String(Math.round(car.speed * 3.6)).padStart(3, '0');
  $('heading').textContent = `${String(Math.round((90 - car.heading * 180 / Math.PI + 360) % 360)).padStart(3, '0')}°`;
  $('grade').textContent = `${car.grade >= 0 ? '+' : ''}${car.grade.toFixed(1)}°`;
  $('position').textContent = `${lat.toFixed(4)}° N\n${lon.toFixed(4)}° E`;
  const remaining = Math.max(0, route.total - car.progress);
  $('remaining').textContent = remaining > 999 ? `${(remaining / 1000).toFixed(1)} KM` : `${Math.round(remaining)} M`;
  $('eta').textContent = car.arrived ? 'ARRIVED' : `${Math.max(1, Math.ceil(remaining / Math.max(car.speed, 11) / 60))} MIN`;
  $('speed-limit').textContent = `LIMIT ~${route.total > 20000 && car.progress > 3000 ? 80 : 50}`;
  const hours = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  const night = solarElevation(new Date(), lon, lat) < -3;
  document.body.classList.toggle('night', night);
  $('time-label').textContent = `${night ? 'NIGHT' : 'DAY'} · ${hours} UTC`;
}

function mercator(lon, lat, z) {
  const n = 2 ** z, x = (lon + 180) / 360 * n, rad = lat * Math.PI / 180;
  return [x, (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n];
}
function updateBev() {
  if (!car || !route) return;
  const [lon, lat] = route.geo(car.x, car.y), z = 16;
  const [tx, ty] = mercator(lon, lat, z), ix = Math.floor(tx), iy = Math.floor(ty);
  const key = `${ix}/${iy}`;
  if (key !== lastBevTile) {
    lastBevTile = key;
    const layer = $('bev-tiles'); layer.replaceChildren();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const img = document.createElement('img'); img.src = `https://tile.openstreetmap.org/${z}/${ix + dx}/${iy + dy}.png`; img.alt = '';
      img.dataset.dx = dx; img.dataset.dy = dy; layer.append(img);
    }
  }
  for (const img of $('bev-tiles').children) {
    img.style.left = `${112 + (ix + Number(img.dataset.dx) - tx) * 256}px`;
    img.style.top = `${112 + (iy + Number(img.dataset.dy) - ty) * 256 - 28}px`;
  }
  const canvas = $('bev'), ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 224, 224);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#042331'; ctx.lineWidth = 7; ctx.beginPath();
  const start = Math.max(0, route.indexAt(car.progress - 300) - 1), end = Math.min(route.coordinates.length - 1, route.indexAt(car.progress + 500) + 1);
  for (let i = start; i <= end; i++) { const [x, y] = mercator(...route.coordinates[i], z); const px = 112 + (x - tx) * 256, py = 112 + (y - ty) * 256; if (i === start) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.stroke(); ctx.strokeStyle = '#7ee8ff'; ctx.lineWidth = 3; ctx.stroke();
  ctx.save(); ctx.translate(112, 112); ctx.rotate(Math.PI / 2 - car.heading); ctx.fillStyle = '#e8f8fb'; ctx.shadowColor = '#7ee8ff'; ctx.shadowBlur = 13;
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.restore();
}
function frame(now) {
  const dt = Math.min(.25, (now - lastFrame) / 1000); lastFrame = now;
  accumulator += dt;
  while (accumulator >= DT) { driveTick(); accumulator -= DT; }
  if (car) cameraTick(dt);
  if (now - lastHud > 240) { updateHud(); updateBev(); lastHud = now; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const list = $('mission-list');
for (const mission of missions) {
  const button = document.createElement('button'); button.textContent = mission.title; button.dataset.mission = mission.id; button.title = mission.subtitle;
  button.addEventListener('click', () => startMission(mission)); list.append(button);
}
for (const field of ['origin', 'destination']) {
  let timer = null, serial = 0;
  $(field).addEventListener('input', () => {
    selected[field] = null; clearTimeout(timer);
    const query = $(field).value.trim(), results = $(`${field}-results`); results.replaceChildren(); results.classList.remove('visible');
    if (query.length < 3) return;
    const request = ++serial;
    timer = setTimeout(async () => {
      try {
        const places = await geocode(query, keys.mapbox);
        if (request !== serial) return;
        results.replaceChildren();
        for (const place of places) {
          const button = document.createElement('button'); button.textContent = place.label;
          button.addEventListener('click', () => { $(field).value = place.label; selected[field] = place.coordinates; results.classList.remove('visible'); });
          results.append(button);
        }
        results.classList.toggle('visible', places.length > 0);
      } catch (error) { notice(`Place search unavailable: ${error.message}`); }
    }, 450);
  });
}
document.addEventListener('click', event => { if (!event.target.closest('.field')) document.querySelectorAll('.suggestions').forEach(el => el.classList.remove('visible')); });
$('drive').addEventListener('click', async () => {
  const button = $('drive'); button.disabled = true; button.textContent = 'ROUTING…';
  try {
    if (!selected.origin) { const result = await geocode($('origin').value, keys.mapbox); selected.origin = result[0]?.coordinates; }
    if (!selected.destination) { const result = await geocode($('destination').value, keys.mapbox); selected.destination = result[0]?.coordinates; }
    if (!selected.origin || !selected.destination) throw new Error('Choose two real places');
    const result = await requestRoute(selected.origin, selected.destination, keys.mapbox);
    await beginDrive(result, $('origin').value.split(',')[0], $('destination').value);
  } catch (error) { notice(`Route unavailable: ${error.message}`); }
  finally { button.disabled = false; button.innerHTML = 'DRIVE <span>↗</span>'; }
});
document.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => setCamera(button.dataset.camera)));
$('driver-toggle').addEventListener('click', () => { if (!car) return; mode = mode === 'PILOT' ? 'MANUAL' : 'PILOT'; updateModeUI(); notice(`${mode} CONTROL`); });
$('pause-toggle').addEventListener('click', () => { paused = !paused; updateModeUI(); });
document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || document.querySelector('dialog[open]')) return;
  const key = event.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) event.preventDefault();
  keydown.add(key);
  if (event.repeat) return;
  if (key === 'c') setCamera(cameraModes[(cameraModes.indexOf(cameraMode) + 1) % 3]);
  if (key === 'p' && car) { mode = 'PILOT'; updateModeUI(); notice('PILOT RESUMED'); }
  if (key === ' ') { paused = !paused; updateModeUI(); }
});
document.addEventListener('keyup', event => keydown.delete(event.key.toLowerCase()));
for (const name of ['left','right','throttle','brake']) {
  const element = $(`touch-${name}`);
  element.addEventListener('pointerdown', event => { event.preventDefault(); element.setPointerCapture(event.pointerId); mobile[name] = true; });
  for (const type of ['pointerup','pointercancel']) element.addEventListener(type, () => { mobile[name] = false; });
}
$('settings-open').addEventListener('click', () => { $('cesium-key').value = keys.cesium || ''; $('mapbox-key').value = keys.mapbox || ''; $('powerup').showModal(); });
$('about-open').addEventListener('click', () => $('about').showModal());
document.querySelectorAll('[data-quality]').forEach(button => { button.classList.toggle('selected', button.dataset.quality === quality); button.addEventListener('click', () => { document.querySelectorAll('[data-quality]').forEach(item => item.classList.remove('selected')); button.classList.add('selected'); }); });
$('save-keys').addEventListener('click', () => { saveKeys({ cesium: $('cesium-key').value, mapbox: $('mapbox-key').value }); localStorage.setItem('roadforge.quality', document.querySelector('[data-quality].selected').dataset.quality); location.reload(); });
const hash = new URLSearchParams(location.hash.slice(1));
if (cameraModes.includes(hash.get('camera'))) setCamera(hash.get('camera'));
const incoming = missions.find(m => m.id === hash.get('mission'));
if (incoming) startMission(incoming);
else if (hash.has('from') && hash.has('to')) {
  const from = hash.get('from').split(',').map(Number), to = hash.get('to').split(',').map(Number);
  if (from.length === 2 && to.length === 2 && [...from, ...to].every(Number.isFinite)) {
    selected = { origin: from, destination: to }; $('origin').value = from.join(', '); $('destination').value = to.join(', '); $('drive').click();
  }
}
