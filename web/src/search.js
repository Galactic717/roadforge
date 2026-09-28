import { requestRoute } from './route.js';

// Common city aliases resolve locally; all other submitted places use Photon.
// There is no autocomplete traffic. A route submission resolves two endpoints.
const cities = [
  { aliases: ['київ','киев','kyiv','kiev'], label: 'Київ', coordinates: [30.5234,50.4501] },
  { aliases: ['пекін','пекин','beijing','peking','北京'], label: 'Пекін', coordinates: [116.4074,39.9042] },
  { aliases: ['токіо','токио','tokyo','東京'], label: 'Токіо', coordinates: [139.7671,35.6812] },
  { aliases: ['львів','львов','lviv'], label: 'Львів', coordinates: [24.0316,49.8419] },
  { aliases: ['одеса','одесса','odesa','odessa'], label: 'Одеса', coordinates: [30.7233,46.4825] },
  { aliases: ['бориспіль','борисполь','boryspil'], label: 'Бориспіль', coordinates: [30.956,50.351] },
];
const cache = new Map();
// Photon indexes local/English names rather than every translated OSM alias.
const internationalNames = {
  'прага':'Prague, Czechia', 'берлін':'Berlin, Germany', 'берлин':'Berlin, Germany',
  'париж':'Paris, France', 'лондон':'London, United Kingdom', 'рим':'Rome, Italy',
  'варшава':'Warsaw, Poland', 'краків':'Krakow, Poland', 'вроцлав':'Wroclaw, Poland',
  'відень':'Vienna, Austria', 'вена':'Vienna, Austria', 'будапешт':'Budapest, Hungary',
  'братислава':'Bratislava, Slovakia', 'бухарест':'Bucharest, Romania',
  'мадрид':'Madrid, Spain', 'барселона':'Barcelona, Spain', 'лісабон':'Lisbon, Portugal',
  'стамбул':'Istanbul, Turkey', 'афіни':'Athens, Greece', 'софія':'Sofia, Bulgaria',
  'амстердам':'Amsterdam, Netherlands', 'брюссель':'Brussels, Belgium',
  'стокгольм':'Stockholm, Sweden', 'копенгаген':'Copenhagen, Denmark',
  'гельсінкі':'Helsinki, Finland', 'хельсінкі':'Helsinki, Finland',
  'нью-йорк':'New York, USA', 'лос-анджелес':'Los Angeles, USA',
  'сан-франциско':'San Francisco, USA', 'вашингтон':'Washington DC, USA',
  'сеул':'Seoul, South Korea', 'шанхай':'Shanghai, China', 'сінгапур':'Singapore',
  'дубай':'Dubai, UAE', 'торонто':'Toronto, Canada', 'сідней':'Sydney, Australia',
};

export function parseRoute(text) {
  const value = text.trim().replace(/^(?:(?:я\s+)?хочу\s+)?(?:маршрут|route)\s*:?\s*/iu, '').replace(/^(?:з|із|від|from)\s+/iu, '');
  let parts = value.split(/\s+(?:—|–|-|→|до|to)\s+|\s*[→—–]\s*/iu);
  if (parts.length !== 2 && value.split('-').length === 2) parts = value.split('-');
  if (parts.length !== 2 || parts.some(part => part.trim().length < 2)) throw new Error('Введіть початок і кінець: Київ — Пекін');
  return parts.map(part => part.trim());
}

async function resolvePlace(query) {
  const normalized = query.toLowerCase().trim();
  const known = cities.find(city => city.aliases.includes(normalized));
  if (known) return known;
  if (cache.has(normalized)) return cache.get(normalized);
  const coordinates = query.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (coordinates) {
    const lat = Number(coordinates[1]), lon = Number(coordinates[2]);
    if (Math.abs(lat) <= 85 && Math.abs(lon) <= 180) return { label: query, coordinates: [lon,lat] };
  }
  const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(internationalNames[normalized] || query)}&limit=5`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Пошук місць тимчасово недоступний. Спробуйте ще раз.');
  const data = await response.json();
  const candidates = data.features?.filter(f => f.geometry?.type === 'Point') || [];
  const feature = candidates.find(f => ['city','district'].includes(f.properties.type) && ['city','town','village','municipality'].includes(f.properties.osm_value)) || candidates[0];
  if (!feature) throw new Error(`Не знайдено «${query}». Додайте країну або адресу.`);
  if (!/[\d,]/.test(query) && ['peak','park','chemist','convenience','clothes','apartments'].includes(feature.properties.osm_value)) {
    throw new Error(`Не знайдено місто «${query}». Додайте країну або напишіть міжнародну назву.`);
  }
  const p = feature.properties;
  const result = { label: [p.name, p.country].filter(Boolean).join(', '), coordinates: feature.geometry.coordinates };
  cache.set(normalized, result);
  return result;
}

export async function buildCustomRoute(text, mapboxToken, onStatus = () => {}, providerGeocode) {
  const [from, to] = parseRoute(text);
  const find = providerGeocode || resolvePlace;
  onStatus(`Знаходжу ${from}…`);
  const origin = await find(from);
  onStatus(`Знаходжу ${to}…`);
  const destination = await find(to);
  onStatus(`Будую дорогу: ${origin.label} → ${destination.label}…`);
  let route;
  try { route = await requestRoute(origin.coordinates, destination.coordinates, mapboxToken); }
  catch (error) {
    if (error.name === 'TimeoutError') throw new Error('Сервіс маршрутизації не відповів за хвилину. Спробуйте ще раз.');
    throw new Error('Не вдалося прокласти автомобільний шлях між цими точками. Спробуйте інші адреси.');
  }
  const mission = { id: 'custom', title: `${from} → ${to}`, street: `${Math.round(route.meta.distance / 1000).toLocaleString('uk-UA')} км · Автопілот`, origin: origin.coordinates, destination: destination.coordinates, speed: 0, query: text, resolved: [origin.label,destination.label] };
  return { route, mission };
}
