import { loadKeys, saveKeys } from './keys.js';

const $ = id => document.getElementById(id);
export function createUI(missions, actions) {
  let noticeTimer, chromeTimer, capture = false, driving = false, lastPhase, lastMode;
  const input = { left: false, right: false, throttle: false, brake: false };
  const held = new Set();
  const map = { a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', w: 'throttle', arrowup: 'throttle', s: 'brake', arrowdown: 'brake' };
  function reveal() {
    if (capture) return;
    document.body.classList.remove('chrome-hidden');
    clearTimeout(chromeTimer);
    if (driving) chromeTimer = setTimeout(() => document.body.classList.add('chrome-hidden'), 2200);
  }
  function setCapture(value) { capture = value; document.body.classList.toggle('capture', value); if (!value) reveal(); }
  for (const mission of missions) {
    const button = document.createElement('button');
    button.textContent = mission.title; button.dataset.mission = mission.id;
    button.addEventListener('click', () => actions.start(mission)); $('city-list').append(button);
  }
  $('home').onclick = () => actions.home();
  $('route-change').onclick = () => { actions.home(); $('route-query').focus(); };
  $('route-form').addEventListener('submit', event => { event.preventDefault(); actions.custom($('route-query').value); });
  $('capture-toggle').onclick = () => actions.capture();
  $('camera-toggle').onclick = () => actions.camera();
  $('pilot-toggle').onclick = () => actions.pilot();
  $('pause-toggle').onclick = () => actions.pause();
  $('settings-open').onclick = () => {
    const keys = loadKeys(); $('cesium-key').value = keys.cesium || ''; $('google-key').value = keys.google || '';
    $('settings').showModal();
  };
  $('save-settings').onclick = () => { saveKeys({ ...loadKeys(), cesium: $('cesium-key').value, google: $('google-key').value }); location.reload(); };
  document.addEventListener('pointermove', reveal, { passive: true });
  document.addEventListener('focusin', reveal);
  document.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement || $('settings').open) return;
    const key = event.key.toLowerCase();
    if (map[key] || key === ' ') event.preventDefault();
    held.add(key);
    if (map[key]) input[map[key]] = true;
    if (event.repeat) return;
    if (key === 'r') actions.capture();
    if (key === 'c') actions.camera();
    if (key === 'p') actions.pilot();
    if (key === ' ') actions.pause();
    if (key === 'escape') { setCapture(false); reveal(); }
  });
  document.addEventListener('keyup', event => {
    held.delete(event.key.toLowerCase());
    for (const direction of Object.keys(input)) input[direction] = [...held].some(key => map[key] === direction);
  });
  window.addEventListener('blur', () => { held.clear(); for (const key of Object.keys(input)) input[key] = false; });
  for (const button of document.querySelectorAll('[data-touch]')) {
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); input[button.dataset.touch] = true; });
    for (const type of ['pointerup', 'pointercancel']) button.addEventListener(type, () => input[button.dataset.touch] = false);
  }
  return {
    input, setCapture, reveal,
    routeBusy(value, error) { $('route-submit').disabled = value; if (value || error !== undefined) $('route-error').textContent = error || ''; },
    routeQuery(value) { $('route-query').value = value; },
    progress(text) { $('street').textContent = text; },
    loading(value, message = 'Finding the road…') { document.body.classList.toggle('loading-world', value); $('loading-label').textContent = message; },
    mission(mission) {
      driving = true; document.body.classList.remove('idle');
      $('place').textContent = mission.title; $('street').textContent = mission.street;
      $('route-change').title = mission.resolved?.join(' → ') || 'Задати інший маршрут';
      for (const button of document.querySelectorAll('[data-mission]')) button.classList.toggle('selected', button.dataset.mission === mission.id);
      reveal();
    },
    idle() { driving = false; setCapture(false); document.body.classList.add('idle'); document.body.classList.remove('in-intro', 'endcard-visible', 'chrome-hidden'); },
    frame(state) {
      if (state.phase === lastPhase) return;
      lastPhase = state.phase;
      document.body.classList.toggle('in-intro', !state.driving);
      document.body.classList.toggle('endcard-visible', state.phase === 'endcard');
      document.body.dataset.phase = state.phase;
    },
    camera(mode) { document.body.dataset.camera = mode; $('camera-toggle').innerHTML = `${mode === 'chase' ? 'Chase' : 'Cockpit'} <span>C</span>`; },
    pilot(mode) { if (lastMode !== mode) { lastMode = mode; $('pilot-toggle').innerHTML = `${mode === 'pilot' ? 'Автопілот' : 'Ви за кермом'} <span>P</span>`; } },
    pause(value) { $('pause-toggle').textContent = value ? '▷' : 'Ⅱ'; $('pause-toggle').setAttribute('aria-label', value ? 'Resume' : 'Pause'); },
    world(label, detail) { $('world-label').textContent = label; if (detail) $('world-detail').textContent = detail; },
    notice(message) { $('notice').textContent = message; $('notice').classList.add('show'); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('notice').classList.remove('show'), 5000); },
  };
}
