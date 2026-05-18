# Central Ingestion Gateway (Backend API)

Acts as the authoritative central ingestion gateway for the streaming topology. It directly abstracts the central storage layer (Redis) and serves dynamic content indices to authorized edge nodes.

## Technical Specifications
* **Runtime:** Node.js (TypeScript) + Express
* **Exposed Ports:** `3000` (Internal Docker network mapping)
* **Dependencies:** Central Ingestion Redis (`redis://redis:6379`)

## Environment Variables Consumed
* `REDIS_URL`: The fully qualified URI linking to the central Redis store. (Default: `redis://redis:6379`)
* `INTERNAL_AUTH_TOKEN`: The private cryptographic secret used to evaluate and authenticate incoming requests.
* `NODE_ENV`: Controls test environment runtime exceptions and mocking headers.

## Security Boundary
Enforces strict zero-trust token validation checking incoming HTTP requests for matching `X-Relay-Token` headers. The `/health` endpoint remains completely open and unauthenticated to allow orchestrators (like Docker Compose) to systematically collect metrics.
