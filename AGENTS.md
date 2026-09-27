# RoadForge contributor notes

- The globe and moving car are the product. Do not revive the retired 2D lab as home.
- Runtime: Vite + vanilla JavaScript + CesiumJS in `web/`; no Python server required.
- Run: `npm install`, `npm run dev`, `npm test`, `npm run build`, `npm run smoke` (install Playwright Chromium first).
- Keep the zero-key path functional: Esri imagery, cached preset routes, OSRM custom routing, Nominatim search.
- Preserve provider attribution, honest limitations, and key storage in browser `localStorage`.
- The historical Python project lives in `legacy/2d-lab/`; changes there do not affect the app.
