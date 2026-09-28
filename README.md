# RoadForge

**Choose a real route. Let the pilot drive it on the globe, or take the wheel.**

## Run and drive

Requires Node.js 20.19+ or 22.12+.

```sh
git clone https://github.com/Galactic717/roadforge.git
cd roadforge
npm install
npm run dev
```

Open [localhost:5173](http://127.0.0.1:5173). Enter a route such as **Київ — Пекін** and press **Поїхали**. You can also enter `хочу маршрут Київ — Пекін`, English `from Kyiv to Beijing`, or latitude/longitude pairs. Common city names resolve locally; other places are searched through Photon only when you submit the route. OSRM supplies the road geometry, then the pilot starts driving automatically. Choose **Tokyo**, **Kyiv**, **Golden Gate** or **Amalfi** for a cached example. Move the pointer to bring back the controls; select the route name to enter a different trip.

**WASD / arrows** take the wheel · **C** switches chase/cockpit · **P** resumes pilot · **Space** pauses · **R** replays with app chrome hidden · **Esc** restores controls. Provider attribution stays visible in capture mode. Capture mode does not record a video.

`npm run build` produces static `dist/`. Every push to `main` publishes [galactic717.github.io/roadforge](https://galactic717.github.io/roadforge/) through the [Pages workflow](.github/workflows/pages.yml). `npm test` checks vehicle and route math; `npx playwright install chromium && npm run smoke` runs the real browser drive at desktop and mobile sizes.

## 3D world

**Tokyo** works without a key using Japan’s open **Project PLATEAU** textured buildings, terrain and GSI aerial imagery. Road and bridge surface meshes are omitted because their broad untextured surfaces obscure the aerial road detail. Other cities have satellite imagery until you connect a provider with 3D coverage. PLATEAU is a textured city model; Google Photorealistic 3D Tiles are a separate, optional source.

For Google 3D, create a [Cesium ion account](https://ion.cesium.com/), add **Google Photorealistic 3D Tiles** and **Cesium World Terrain** to your assets, then create an `assets:read` [access token](https://cesium.com/learn/ion/cesium-ion-access-tokens/) limited to those assets and your app URLs. Open **World settings** at the top right, paste the token, and choose **Save & reload**. A Google Maps **Map Tiles API** key is also supported in the panel.

Settings store keys in browser `localStorage`. For local development, copy `.env.example` to `.env.local`; `VITE_CESIUM_ION_TOKEN` and `VITE_GOOGLE_MAPS_API_KEY` are optional. Vite embeds these values in browser code: use restricted public-client credentials, never private keys. Provider coverage, terms and quotas apply. The Google path requires your credential and has not been verified with a live token.

## Limits and credits

A visual simulation, not a real vehicle controller or FSD. Routes follow map geometry, without lane-level navigation, traffic or collision detection. Public routing cannot guarantee a drivable connection between arbitrary cities, especially across borders. Ground alignment depends on source data; bridges and mismatched surveys can produce artifacts. Network access and WebGL are required, and initial 3D loading can take time. If Tokyo’s service is unavailable, it falls back to satellite imagery.

World: [PLATEAU, NASA, Esri and optional providers](web/public/world/ATTRIBUTION.md). Routes: [OpenStreetMap contributors / OSRM](web/public/routes/README.md). Car: original [RoadForge GT, CC0](web/public/models/README.md). App: [MIT](LICENSE). The retired Python lab remains in `legacy/2d-lab/` and is not the homepage.
