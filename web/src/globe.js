import * as C from 'cesium';

const base = import.meta.env.BASE_URL;
// Cesium's ESM build resolves worker URLs from its optimized Vite chunk unless
// the runtime base is explicit. Keep development and /roadforge/ builds equal.
window.CESIUM_BASE_URL = new URL(`${base}cesium/`, document.baseURI).href;
const validHeight = h => Number.isFinite(h) && h > -500 && h < 9000;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const timeout = (promise, ms, fallback) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(fallback), ms))]);
const plateauCredit = new C.Credit('<a href="https://www.mlit.go.jp/plateau/">Tokyo / Project PLATEAU</a> · <a href="https://www.mlit.go.jp/plateau/site-policy/">CC BY 4.0</a>', true);

/**
 * Call await ready, then await prepareRoute(route, mission) behind the loading
 * veil before starting the intro. sampleGround is synchronous during driving.
 * status is a live object; photorealistic is true only for Google's data.
 */
export function createGlobe(keys = {}) {
  C.Ion.defaultAccessToken = keys.cesium || '';
  const viewer = new C.Viewer('globe', {
    baseLayer: false, terrainProvider: new C.EllipsoidTerrainProvider(),
    animation: false, timeline: false, geocoder: false, homeButton: false,
    navigationHelpButton: false, baseLayerPicker: false, sceneModePicker: false,
    fullscreenButton: false, infoBox: false, selectionIndicator: false,
    shouldAnimate: true, requestRenderMode: false, shadows: false,
    contextOptions: { webgl: { alpha: false, antialias: true, preserveDrawingBuffer: true } },
  });
  const scene = viewer.scene;
  viewer.clock.shouldAnimate = false;
  viewer.clock.currentTime = C.JulianDate.fromIso8601('2026-06-21T07:10:00Z');
  viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);
  scene.highDynamicRange = true;
  scene.msaaSamples = 4;
  scene.postProcessStages.fxaa.enabled = true;
  scene.globe.baseColor = C.Color.fromCssColorString('#07101c');
  scene.globe.depthTestAgainstTerrain = true;
  scene.globe.enableLighting = false;
  scene.globe.maximumScreenSpaceError = 1.5;
  scene.globe.tileCacheSize = 512;
  scene.globe.preloadAncestors = true;
  scene.globe.preloadSiblings = true;
  scene.globe.showGroundAtmosphere = true;
  scene.skyAtmosphere.show = true;
  scene.fog.enabled = true;
  scene.fog.density = .00012;
  scene.backgroundColor = C.Color.fromCssColorString('#020408');
  scene.screenSpaceCameraController.minimumZoomDistance = 1;
  scene.screenSpaceCameraController.enableCollisionDetection = false;
  viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(123, 27, 19000000), orientation: { heading: .08, pitch: -Math.PI / 2, roll: -.08 } });

  const status = { provider: 'loading', buildings: false, photorealistic: false, terrain: false, ready: false, message: '', prepared: false };
  let nightLayer, googleTiles, tokyoTiles = [], buildingTiles = [], japanTerrain, worldTerrain;
  let intro = true, activeRoute = null, profile = [], lastProgress = 0, preparation = 0;
  let tokyoPromise = null, orthoLayer;
  const terrainCredit = new C.Credit('<a href="https://docs.plateauview.mlit.go.jp/datasets/terrain/">PLATEAU · Mapterhorn · GSI</a>', true);
  function announce() { window.dispatchEvent(new CustomEvent('roadforge:world', { detail: { ...status } })); }

  async function bootImagery() {
    const results = await Promise.allSettled([
      C.SingleTileImageryProvider.fromUrl(`${base}world/earth-night.jpg`, { credit: new C.Credit('NASA Earth Observatory / Black Marble 2016', true) }),
      C.ArcGisMapServerImageryProvider.fromUrl('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'),
    ]);
    if (results[1].status === 'fulfilled') {
      const imagery = viewer.imageryLayers.addImageryProvider(results[1].value);
      imagery.brightness = 1.02; imagery.contrast = 1.06; imagery.saturation = .86;
    }
    if (results[0].status === 'fulfilled') {
      nightLayer = viewer.imageryLayers.addImageryProvider(results[0].value);
      nightLayer.brightness = 1.7; nightLayer.contrast = 1.07; nightLayer.gamma = .85;
    }
  }

  async function bootProviders() {
    if (keys.cesium) {
      try {
        worldTerrain = await C.createWorldTerrainAsync({ requestVertexNormals: true });
        viewer.terrainProvider = worldTerrain; status.terrain = true;
      } catch { status.message = 'World terrain is unavailable for this token.'; }
    }
    if (keys.cesium || keys.google) {
      try {
        googleTiles = await C.createGooglePhotorealistic3DTileset({
          ...(keys.google ? { key: keys.google } : {}),
          // Custom place searches use Google's geocoder whenever this source is active.
          onlyUsingWithGoogleGeocoder: true,
        }, {
          maximumScreenSpaceError: 6, cacheBytes: 512 * 1024 * 1024,
          maximumCacheOverflowBytes: 256 * 1024 * 1024,
          preloadFlightDestinations: true, skipLevelOfDetail: false,
          cullRequestsWhileMoving: false,
        });
        scene.primitives.add(googleTiles);
        status.provider = 'google'; status.buildings = true; status.photorealistic = true;
      } catch {
        status.message = 'Enable Google Photorealistic 3D Tiles for this Cesium token. Tokyo also has open 3D city data.';
      }
    }
    if (!googleTiles) status.provider = 'satellite';
  }

  const ready = Promise.all([bootImagery(), bootProviders()]).then(() => {
    status.ready = true; announce(); return status;
  });

  async function loadTokyo() {
    if (tokyoPromise) return tokyoPromise;
    tokyoPromise = (async () => {
      const response = await fetch(`${base}world/tokyo-tiles.json`);
      if (!response.ok) throw new Error('Tokyo 3D catalog unavailable');
      const catalog = await response.json();
      const terrainTask = C.CesiumTerrainProvider.fromUrl('https://tile.plateauview.mlit.go.jp/terrain', {
        requestVertexNormals: true, credit: terrainCredit,
      }).then(provider => { japanTerrain = provider; }).catch(() => {});
      // Road and bridge CityGML meshes are not textured consistently. Their
      // broad flat surfaces can also cover the surveyed ground by metres.
      // Keep the textured city architecture over the real aerial road imagery.
      const tileResults = await Promise.allSettled(catalog.filter(entry => entry.type_en === 'bldg').map(async entry => {
        const tileset = await C.Cesium3DTileset.fromUrl(new C.Resource({ url: entry.url, credits: [plateauCredit] }), {
          maximumScreenSpaceError: 5, cacheBytes: 96 * 1024 * 1024,
          maximumCacheOverflowBytes: 64 * 1024 * 1024,
          preloadFlightDestinations: true, cullRequestsWhileMoving: false,
          skipLevelOfDetail: true, dynamicScreenSpaceError: true,
        });
        tileset.show = false;
        scene.primitives.add(tileset); tokyoTiles.push(tileset);
        if (entry.type_en === 'bldg') buildingTiles.push(tileset);
        return tileset;
      }));
      await terrainTask;
      if (!tileResults.some(result => result.status === 'fulfilled')) throw new Error('Tokyo 3D service unavailable');
      orthoLayer = viewer.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({
        // PLATEAU-Ortho 2023 has no Tokyo coverage. GSI provides the official
        // seamless national orthophoto; use the supported maximum level.
        url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
        minimumLevel: 2, maximumLevel: 18,
        rectangle: C.Rectangle.fromDegrees(139.64, 35.53, 139.91, 35.79),
        credit: new C.Credit('<a href="https://maps.gsi.go.jp/development/ichiran.html">GSI aerial imagery</a>', true),
      }));
      orthoLayer.show = false;
      if (nightLayer) viewer.imageryLayers.raiseToTop(nightLayer);
    })();
    return tokyoPromise;
  }

  function setIntro(active) { intro = Boolean(active); }
  scene.preRender.addEventListener(() => {
    const altitude = viewer.camera.positionCartographic.height;
    scene.globe.showGroundAtmosphere = altitude < 100000;
    if (nightLayer) nightLayer.alpha = intro ? clamp((Math.log10(Math.max(1, altitude)) - 4.9) / 1.15, 0, 1) : 0;
    scene.globe.show = !googleTiles || altitude > 350000;
    if (googleTiles) googleTiles.show = altitude < 900000;
  });

  function waitForLocalTiles(ms = 14000) {
    return new Promise(resolve => {
      const started = performance.now(); let quietFrames = 0;
      const remove = scene.postRender.addEventListener(() => {
        const visible = googleTiles ? [googleTiles] : tokyoTiles.filter(t => t.show);
        const settled = scene.globe.tilesLoaded && visible.every(t => t.tilesLoaded);
        quietFrames = settled ? quietFrames + 1 : 0;
        if ((quietFrames >= 7 && performance.now() - started > 1200) || performance.now() - started > ms) { remove(); resolve(settled); }
      });
    });
  }

  async function prepareRoute(route, mission = {}) {
    const generation = ++preparation;
    await ready;
    status.prepared = false;
    activeRoute = route; lastProgress = 0; profile = [];
    const isTokyo = mission.id === 'tokyo-bay' || (route.origin[0] > 139 && route.origin[0] < 140 && route.origin[1] > 35 && route.origin[1] < 36);
    if (!googleTiles && isTokyo) {
      try {
        await loadTokyo();
        if (generation !== preparation) return status;
        status.provider = 'plateau'; status.buildings = buildingTiles.length > 0;
        status.message = 'Tokyo city model · Project PLATEAU';
        if (japanTerrain) { viewer.terrainProvider = japanTerrain; status.terrain = true; }
      } catch { status.provider = 'satellite'; status.buildings = false; status.message = 'Tokyo 3D service is unavailable. Satellite fallback.'; }
    } else if (!googleTiles) {
      status.provider = 'satellite'; status.buildings = false;
      status.message = 'Satellite preview · connect a Cesium token for photoreal 3D';
      viewer.terrainProvider = worldTerrain || new C.EllipsoidTerrainProvider();
      status.terrain = Boolean(worldTerrain);
    }
    for (const tileset of tokyoTiles) tileset.show = isTokyo && !googleTiles;
    if (orthoLayer) orthoLayer.show = isTokyo && !googleTiles;
    announce();
    const [lon, lat] = route.origin;
    const hour = ((16 - lon / 15) % 24 + 24) % 24;
    viewer.clock.currentTime = C.JulianDate.fromDate(new Date(Date.UTC(2026, 5, 21, 0, hour * 60)));
    const samples = [];
    for (let d = 0; d < route.total; d += d < 1800 ? 12 : Math.max(35, route.total / 220)) {
      const point = route.at(d), geo = route.geo(point.x, point.y);
      samples.push({ ...point, d, lon: geo[0], lat: geo[1], height: 0 });
    }
    const end = route.at(route.total), endGeo = route.geo(end.x, end.y);
    samples.push({ ...end, d: route.total, lon: endGeo[0], lat: endGeo[1], height: 0 });
    if (status.terrain) {
      // Only prepare the near driving corridor. Arbitrary long routes must not
      // download high-detail terrain across countries before the first frame.
      const local = samples.filter(p => p.d <= 1800);
      const positions = local.map(p => C.Cartographic.fromDegrees(p.lon, p.lat));
      try {
        const terrain = await timeout(C.sampleTerrainMostDetailed(viewer.terrainProvider, positions), 18000, []);
        terrain.forEach((p, i) => { if (validHeight(p.height)) local[i].height = p.height; });
      } catch { /* Rendered terrain remains available. */ }
    }
    if (generation !== preparation) return status;
    const cameraState = {
      destination: C.Cartesian3.clone(viewer.camera.positionWC),
      orientation: { direction: C.Cartesian3.clone(viewer.camera.directionWC), up: C.Cartesian3.clone(viewer.camera.upWC) },
    };
    const heading = Math.PI / 2 - route.at(0).heading;
    viewer.camera.lookAt(C.Cartesian3.fromDegrees(lon, lat, samples[0].height), new C.HeadingPitchRange(heading, -.28, 230));
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
    await waitForLocalTiles();
    if (generation !== preparation) return status;
    if (googleTiles && scene.sampleHeightSupported) {
      // Exclude PLATEAU buildings so facade overhangs cannot become the road.
      // Google is one mesh: take the lowest of three narrow corridor samples.
      const local = samples.filter(p => p.d < 1800);
      const positions = local.flatMap(p => (googleTiles ? [-1.4, 0, 1.4] : [0]).map(offset => {
        const [x, y] = route.geo(p.x - Math.sin(p.heading) * offset, p.y + Math.cos(p.heading) * offset);
        return C.Cartographic.fromDegrees(x, y);
      }));
      try {
        const result = await timeout(scene.sampleHeightMostDetailed(positions, [...viewer.entities.values, ...buildingTiles], .15), 18000, []);
        const stride = googleTiles ? 3 : 1;
        local.forEach((point, i) => {
          const heights = result.slice(i * stride, i * stride + stride).map(p => p.height).filter(validHeight);
          if (heights.length) point.height = Math.max(point.height, Math.min(...heights));
        });
      } catch { /* Keep the terrain profile when depth sampling is absent. */ }
    }
    if (generation !== preparation) return status;
    for (let i = 1; i < samples.length - 1; i++) {
      const a = samples[i - 1], p = samples[i], b = samples[i + 1];
      const allowed = 1.2 + .25 * Math.max(p.d - a.d, b.d - p.d);
      if (p.height > Math.max(a.height, b.height) + allowed) p.height = (a.height + b.height) / 2;
    }
    profile = samples;
    viewer.camera.setView(cameraState);
    status.prepared = true; announce();
    return status;
  }

  function sampleGround(lon, lat, previous = 0) {
    const ground = scene.globe.getHeight(C.Cartographic.fromDegrees(lon, lat));
    if (!activeRoute || !profile.length) return validHeight(ground) ? ground : previous;
    const x = (lon - activeRoute.origin[0]) * Math.PI / 180 * 6378137 * Math.cos(activeRoute.origin[1] * Math.PI / 180);
    const y = (lat - activeRoute.origin[1]) * Math.PI / 180 * 6378137;
    const nearest = activeRoute.nearest(x, y, lastProgress);
    if (nearest.distance > 22) return validHeight(ground) ? ground : previous;
    lastProgress = nearest.progress;
    let low = 0, high = profile.length - 1;
    while (low + 1 < high) { const mid = (low + high) >> 1; if (profile[mid].d <= nearest.progress) low = mid; else high = mid; }
    const a = profile[low], b = profile[high];
    const fraction = b.d > a.d ? clamp((nearest.progress - a.d) / (b.d - a.d), 0, 1) : 0;
    const preparedHeight = a.height + (b.height - a.height) * fraction;
    // For aerial imagery the rendered terrain is the road itself. Prefer its
    // current surface over interpolation between coarser preparation samples.
    if (!googleTiles && validHeight(ground)) return ground;
    return preparedHeight;
  }

  let googleGeocoder;
  async function geocodeGoogle(query) {
    googleGeocoder ||= keys.google
      ? new C.GoogleGeocoderService({ key: keys.google })
      : new C.IonGeocoderService({ scene, accessToken: keys.cesium, geocodeProviderType: C.IonGeocodeProviderType.GOOGLE });
    const results = await googleGeocoder.geocode(query);
    const result = results[0];
    if (!result) throw new Error(`Не знайдено «${query}». Додайте країну або адресу.`);
    const point = result.destination instanceof C.Rectangle
      ? C.Rectangle.center(result.destination)
      : C.Cartographic.fromCartesian(result.destination);
    if (googleGeocoder.credit) scene.frameState.creditDisplay.addStaticCredit(googleGeocoder.credit);
    if (result.attribution?.html) scene.frameState.creditDisplay.addStaticCredit(new C.Credit(result.attribution.html, true));
    return { label: result.displayName, coordinates: [C.Math.toDegrees(point.longitude), C.Math.toDegrees(point.latitude)] };
  }
  scene.frameState.creditDisplay.addStaticCredit(new C.Credit('<a href="https://www.openstreetmap.org/copyright">Routes © OpenStreetMap</a>', true));
  return { viewer, ready, status, prepareRoute, sampleGround, setIntro,
    get geocode() { return googleTiles ? geocodeGoogle : undefined; },
  };
}
