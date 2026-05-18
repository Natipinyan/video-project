# Edge Distribution Relay Server

Implements a decoupled reverse-proxy mechanism representing Site B distribution points. It caches upstream streaming components locally to offload stress from the primary backhaul core link.

## Technical Specifications
* **Runtime:** Node.js (TypeScript) + Express + Axios
* **Exposed Ports:** `8080` (Distribution endpoint serving the Web UI frontend)
* **Dependencies:** Central Backend API (`http://api:3000`), Local Caching Store (`redis://edge-redis:6379`)

## Environment Variables Consumed
* `REDIS_URL`: URI pointing to the isolated local edge memory container. (Default: `redis://edge-redis:6379`)
* `BACKEND_API_URL`: Base target URL identifying the master upstream Backend gateway. (Default: `http://api:3000`)
* `INTERNAL_AUTH_TOKEN`: Secret string automatically injected into outbound `X-Relay-Token` HTTP headers to authenticate with the Backend.

## Caching Strategy
Intercepts client segment sweeps. Operates on a strict 10-second expiration buffer (`EX 10`) to balance dynamic client video retrieval against backhaul network limits.
