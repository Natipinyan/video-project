export interface Config {
    port: number;
    redisUrl: string;
    backendApiUrl: string;
    axiosTimeout: number;
    edgeCacheTtl: number;
}

const getEnvConfig = (): Config => {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
    if (isNaN(port)) {
        throw new Error("[CONFIG ERROR]: PORT environment variable must be a valid number.");
    }

    const axiosTimeout = process.env.AXIOS_TIMEOUT ? parseInt(process.env.AXIOS_TIMEOUT, 10) : 5000;
    if (isNaN(axiosTimeout)) {
        throw new Error("[CONFIG ERROR]: AXIOS_TIMEOUT environment variable must be a valid number.");
    }

    const edgeCacheTtl = process.env.EDGE_CACHE_TTL ? parseInt(process.env.EDGE_CACHE_TTL, 10) : 10;
    if (isNaN(edgeCacheTtl)) {
        throw new Error("[CONFIG ERROR]: EDGE_CACHE_TTL environment variable must be a valid number.");
    }

    const redisUrl = process.env.REDIS_URL || 'redis://edge-redis:6379';
    const backendApiUrl = process.env.BACKEND_API_URL || 'http://api:3000';

    return {
        port,
        redisUrl,
        backendApiUrl,
        axiosTimeout,
        edgeCacheTtl,
    };
};

export const config = getEnvConfig();