import express, { Request, Response } from 'express';
import Redis from 'ioredis';
import axios from 'axios';
import cors from 'cors';

const app = express();
const redis = new Redis(process.env.REDIS_URL || 'redis://edge-redis:6379');
const BACKEND_URL = process.env.BACKEND_API_URL || 'http://api:3000';
const PORT = 8080;

app.use(cors({
    origin: '*',
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Range'],
    exposedHeaders: ['Content-Length', 'Content-Range']
}));

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
    try {
        const redisStatus = await redis.ping();
        if (redisStatus !== 'PONG') {
            throw new Error('Local Edge Redis did not respond with PONG');
        }

        await axios.get(`${BACKEND_URL}/health`, { timeout: 2000 });

        return res.status(200).send('OK');
    } catch (err: any) {
        console.error(`[EDGE HEALTHCHECK FAILED]: ${err.message}`);
        return res.status(500).send('Unhealthy');
    }
});

app.get('/:channel/:file', async (req: Request, res: Response) => {
    const { channel, file } = req.params;
    const cacheKey = `edge:${channel}:${file}`;

    try {
        const cachedData = await redis.getBuffer(cacheKey);

        if (cachedData) {
            res.setHeader('Content-Type', file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T');
            return res.send(cachedData);
        }

        const response = await axios.get(`${BACKEND_URL}/${channel}/${file}`, {
            responseType: 'arraybuffer',
            timeout: 5000
        });

        const data = Buffer.from(response.data);

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

app.listen(PORT, () => {
    console.log(`Edge Server (Site B) is live on port ${PORT}`);
});