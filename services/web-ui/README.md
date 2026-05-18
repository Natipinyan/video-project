# Client Interface Layer (Web UI)

Provides a lightweight administrative dashboard rendering adaptive live stream playback modules embedded directly in standard client browser ecosystems.

## Technical Specifications
* **Runtime:** Vite + React (TypeScript) + HLS.js
* **Exposed Ports:** `5173` (Local browser access layer)
* **Dependencies:** Edge Server distribution socket (`http://localhost:8080`)

## Environment Variables Consumed
* `VITE_API_URL`: Destination routing pointer telling the video element player where to look for live segments. (Default: `http://localhost:8080`)

## Operational Notes
Leverages the `hls.js` engine components to assemble independent streaming source playlists retrieved directly from distribution edge server instances.
