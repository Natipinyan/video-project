# High-Speed Ingestion Receiver

Intercepts incoming raw live streams via UDP and slices them dynamically into valid HLS playlists and binary media chunks.

## Technical Specifications
* **Runtime:** Node.js (TypeScript) + Native FFmpeg wrappers
* **Exposed Ports:** Dynamic UDP configuration sockets (`1234`, `1235` based on deployment)
* **Dependencies:** In-Memory host mount points (`/dev/shm`), Central Ingestion Redis (`redis://redis:6379`)

## Environment Variables Consumed
* `REDIS_URL`: The destination path linking to the central Redis store. (Default: `redis://redis:6379`)
* `CHANNEL_NAME`: Strict target identifier determining playlist routing keys (e.g., `channel_1`).
* `UDP_PORT`: Network channel socket assigned for stream capture.

## In-Memory Architecture (RAM Pipelines)
To bypass performance bottlenecks and avoid destroying physical disks with continuous write cycles, this service enforces a strict in-memory workflow. It writes raw HLS outputs directly to Linux Shared Memory space (`/dev/shm/hls_out`). It captures output updates by tailing FFmpeg's `stderr` logging stream, immediately reading and pushing bytes to Redis memory upon segment completion.
