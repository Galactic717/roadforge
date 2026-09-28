# RoadForge contributor notes

- The globe, route and moving car are the product. Keep route entry and four city chips accessible with minimal fading controls; do not restore the retired dashboard or 2D lab as home.
- Runtime: Vite + vanilla JavaScript + CesiumJS in `web/`; no Python server required. `main.js` connects globe, camera, drive, car and UI modules.
- Run from the repository root: `npm install`, `npm run dev`, `npm test`, `npm run build`, `npm run smoke` (install Playwright Chromium first).
- Keep route entry and automatic driving functional. Public geocoding/routing may fail for disconnected or cross-border destinations; show an honest error and retain the cached drives.
- Preserve the keyless Tokyo PLATEAU 3D path. Google Photorealistic 3D Tiles require a user credential and must not be described as verified without a live test. Satellite imagery is a fallback, not photoreal 3D.
- `R` replays in capture mode, `Esc` restores controls. Hide app chrome while preserving provider attribution. Capture mode does not record a video.
- `C` changes chase/cockpit, `P` resumes pilot, `WASD`/arrows take manual control, and Space pauses. Keep desktop and mobile layouts usable.
- Keep credentials out of Git. Settings use browser `localStorage`; optional Vite environment values are browser-visible and must use restricted public-client tokens.
- Verify changes in the running browser, including real movement, camera framing, errors and loading failures. Keyless smoke checks route-entry validation and Kyiv at 1280×720 and 390×844; it does not certify live arbitrary routing, Tokyo tile quality or the credentialed Google path.
- Keep the primary route field usable with Ukrainian or English city pairs. Resolve common city aliases locally and query Photon only on submission; do not add geocoding traffic for every keystroke.
- Keep attribution current in `web/public/world/ATTRIBUTION.md`, `web/public/routes/README.md` and `web/public/models/README.md`. The historical Python project is isolated in `legacy/2d-lab/`.
