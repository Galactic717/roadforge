const KEY = 'roadforge.powerup.v1';
export function loadKeys() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
export function saveKeys(keys) { localStorage.setItem(KEY, JSON.stringify({ cesium: keys.cesium?.trim() || '', mapbox: keys.mapbox?.trim() || '' })); }
