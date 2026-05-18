import express, { Request, Response } from 'express';
import Redis from 'ioredis';
import axios from 'axios';
import cors from 'cors';

export const app = express();
export const redis = new Redis(process.env.REDIS_URL || 'redis://edge-redis:6379');
const BACKEND_URL = process.env.BACKEND_API_URL || 'http://api:3000';
const PORT = 8080;


app.use(cors({
    origin: '*',
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Range'],
    exposedHeaders: ['Content-Length', 'Content-Range']
}));


const getUpstreamConfig = (additionalConfig = {}) => {
    return {
        ...additionalConfig,
        headers: {
            'X-Relay-Token': process.env.INTERNAL_AUTH_TOKEN || ''
        }
    };
};

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
    try {
        const redisStatus = await redis.ping();
        if (redisStatus !== 'PONG') {
            throw new Error('Local Edge Redis did not respond with PONG');
        }

        await axios.get(`${BACKEND_URL}/health`, getUpstreamConfig({ timeout: 2000 }));

        return res.status(200).send('OK');
    } catch (err: any) {
        console.error(`[EDGE HEALTHCHECK FAILED]: ${err.message}`);
        return res.status(500).send('Unhealthy');
    }
});

// Route to proxy channels list from Backend to Web UI
app.get('/channels', async (req: Request, res: Response) => {
    try {
        const response = await axios.get(`${BACKEND_URL}/channels`, getUpstreamConfig({ timeout: 3000 }));
        return res.status(200).json(response.data);
    } catch (err: any) {
        console.error(`[EDGE CHANNELS FETCH FAILED]: ${err.message}`);
        if (err.response && err.response.status === 401) {
            return res.status(403).send('Forbidden: Edge Server authentication with upstream failed');
        }
        return res.status(502).send('Backend API Unreachable');
    }
});

// Route get file
app.get('/:channel/:file', async (req: Request, res: Response) => {
    const { channel, file } = req.params as { channel: string; file: string };
    const cacheKey = `edge:${channel}:${file}`;

    try {
        const cachedData = await redis.getBuffer(cacheKey);

        if (cachedData) {
            res.setHeader('Content-Type', file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T');
            return res.send(cachedData);
        }

        const response = await axios.get(
            `${BACKEND_URL}/${channel}/${file}`,
            getUpstreamConfig({ responseType: 'arraybuffer', timeout: 5000 })
        );

        const data = Buffer.from(response.data);

        // RATIONALE: A short 10-second cache window (EX 10) at the edge layer prevents hammering
        // the central Backend API during massive concurrent user playback spikes. It ensures that
        // even with hundreds of dynamic player clients fetching segments simultaneously, only one upstream
        // request per 10 seconds hits the source core, while keeping the video practically live.
        await redis.set(cacheKey, data, 'EX', 10);

        const contentType = response.headers['content-type'];
        res.setHeader('Content-Type', String(contentType));
        res.send(data);

    } catch (err: any) {
        if (err.response) {
            console.error(`[SOURCE ERROR] ${file}: ${err.response.status}`);
            res.status(err.response.status).send(err.response.data);
        } else {
            console.error(`[EDGE ERROR] ${file}: ${err.message}`);
            res.status(err.code === 'ECONNABORTED' ? 504 : 502).send('Source Unreachable');
        }
    }
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Edge Server (Site B) is live on port ${PORT}`);
    });
}