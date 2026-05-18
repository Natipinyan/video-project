export interface Config {
    port: number;
    redisUrl: string;
}

const getEnvConfig = (): Config => {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    if (isNaN(port)) {
        throw new Error("[CONFIG ERROR]: PORT environment variable must be a valid number.");
    }

    const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

    return {
        port,
        redisUrl,
    };
};

export const config = getEnvConfig();