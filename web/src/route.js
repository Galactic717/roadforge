const R = 6378137;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export class Route {
  constructor(coordinates, meta = {}) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) throw new Error('Route needs at least two coordinates');
    this.coordinates = coordinates;
    this.meta = meta;
    this.origin = coordinates[0];
    const lat0 = this.origin[1] * Math.PI / 180;
    this.points = coordinates.map(([lon, lat]) => ({ x: (lon - this.origin[0]) * Math.PI / 180 * R * Math.cos(lat0), y: (lat - this.origin[1]) * Math.PI / 180 * R }));
    this.cumulative = [0];
    for (let i = 1; i < this.points.length; i++) this.cumulative.push(this.cumulative[i - 1] + Math.hypot(this.points[i].x - this.points[i - 1].x, this.points[i].y - this.points[i - 1].y));
    this.total = this.cumulative.at(-1);
    if (this.total < 5) throw new Error('Route is too short');
  }
  geo(x, y) { return [this.origin[0] + x / (R * Math.cos(this.origin[1] * Math.PI / 180)) * 180 / Math.PI, this.origin[1] + y / R * 180 / Math.PI]; }
  at(distance) {
    const d = clamp(distance, 0, this.total);
    let lo = 0, hi = this.cumulative.length - 1;
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (this.cumulative[mid] <= d) lo = mid; else hi = mid; }
    const a = this.points[lo], b = this.points[lo + 1], span = this.cumulative[lo + 1] - this.cumulative[lo];
    const t = span ? (d - this.cumulative[lo]) / span : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: Math.atan2(b.y - a.y, b.x - a.x), index: lo };
  }
  nearest(x, y, previous = 0) {
    let best = { distance: Infinity, progress: previous, x: 0, y: 0, heading: 0 };
    const start = Math.max(0, this.indexAt(Math.max(0, previous - 90)) - 2);
    const end = Math.min(this.points.length - 2, this.indexAt(Math.min(this.total, previous + 300)) + 8);
    for (let i = start; i <= end; i++) {
      const a = this.points[i], b = this.points[i + 1], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      if (!len2) continue;
      const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / len2, 0, 1);
      const px = a.x + dx * t, py = a.y + dy * t;
      const distance = Math.hypot(x - px, y - py);
      if (distance < best.distance) best = { distance, progress: this.cumulative[i] + Math.sqrt(len2) * t, x: px, y: py, heading: Math.atan2(dy, dx) };
    }
    return best;
  }
  indexAt(distance) {
    let lo = 0, hi = this.cumulative.length - 1;
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (this.cumulative[mid] <= distance) lo = mid; else hi = mid; }
    return lo;
  }
}

export async function requestRoute(origin, destination, mapboxToken = '') {
  const coords = `${origin.join(',')};${destination.join(',')}`;
  const url = mapboxToken
    ? `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&steps=true&access_token=${encodeURIComponent(mapboxToken)}`
    : `https://router.project-osrm.org/route/v1/driving/${coords}?geometries=geojson&overview=full&steps=true`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Routing service returned ${response.status}`);
  const data = await response.json();
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error(data.message || 'No drivable route found');
  const result = data.routes[0];
  return new Route(result.geometry.coordinates, { distance: result.distance, duration: result.duration, source: mapboxToken ? 'Mapbox Directions' : 'OSRM', legs: result.legs });
}

export async function cachedMission(id) {
  const response = await fetch(`/routes/${id}.json`);
  if (!response.ok) throw new Error('Preset route cache unavailable');
  const data = await response.json();
  return new Route(data.coordinates, { distance: data.distance, duration: data.duration, source: data.source });
}

export async function geocode(query, mapboxToken = '') {
  const url = mapboxToken
    ? `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?autocomplete=true&limit=5&access_token=${encodeURIComponent(mapboxToken)}`
    : `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=5&addressdetails=1`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Search returned ${response.status}`);
  const data = await response.json();
  return mapboxToken
    ? data.features.map(item => ({ label: item.place_name, coordinates: item.center }))
    : data.map(item => ({ label: item.display_name, coordinates: [Number(item.lon), Number(item.lat)] }));
}
