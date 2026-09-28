const KEY = 'roadforge.powerup.v1';

// Vite variables are browser-visible build configuration. Use restricted tokens;
// the settings flow keeps credentials on this browser, out of the repository.
export function loadKeys() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* Storage may be disabled. */ }
  return {
    cesium: stored.cesium?.trim() || import.meta.env.VITE_CESIUM_ION_TOKEN?.trim() || '',
    google: stored.google?.trim() || import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || '',
    mapbox: stored.mapbox?.trim() || '',
  };
}

export function saveKeys(keys) {
  localStorage.setItem(KEY, JSON.stringify({ cesium: keys.cesium?.trim() || '', google: keys.google?.trim() || '', mapbox: keys.mapbox?.trim() || '' }));
}
