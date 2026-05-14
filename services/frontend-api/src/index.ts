import express, { Request, Response } from 'express';
import Redis from 'ioredis';
import cors from 'cors';
import NodeCache from 'node-cache';

const app = express();
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
const PORT = 3000;

const internalCache = new NodeCache({ stdTTL: 10, checkperiod: 5 });

app.use(cors());

app.get('/:channel/stream.m3u8', async (req: Request, res: Response) => {
    const { channel } = req.params;
    const cacheKey = `playlist:${channel}`;
    const redisKey = `video:${channel}:playlist`;

    const cachedPlaylist = internalCache.get(cacheKey);
    if (cachedPlaylist) {
        console.log(`[CACHE HIT] Playlist: ${channel}`);
        res.setHeader('Content-Type', 'application/x-mpegURL');
        return res.send(cachedPlaylist);
    }

    try {
        const playlist = await redis.get(redisKey);
        if (playlist) {
            internalCache.set(cacheKey, playlist);
            res.setHeader('Content-Type', 'application/x-mpegURL');
            res.send(playlist);
        } else {
            res.status(404).send('Playlist not found');
        }
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.get('/:channel/:segment', async (req: Request, res: Response) => {
    const { channel, segment } = req.params;
    const cacheKey = `seg:${channel}:${segment}`;
    const redisKey = `video:${channel}:seg:${segment}`;

    const cachedSegment = internalCache.get<Buffer>(cacheKey);
    if (cachedSegment) {
        return res.setHeader('Content-Type', 'video/MP2T').send(cachedSegment);
    }

    try {
        const data = await redis.getBuffer(redisKey);
        if (data) {
            internalCache.set(cacheKey, data);
            res.setHeader('Content-Type', 'video/MP2T');
            res.send(data);
        } else {
            res.status(404).send('Segment not found');
        }
    } catch (err) {
        res.status(500).send('Error');
    }
});

export { app };
export default app;

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Frontend API with Internal Cache is running on port ${PORT}`);
    });
}