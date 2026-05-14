import express, { Request, Response } from 'express';
import Redis from 'ioredis';
import cors from 'cors';

const app = express();
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
const PORT = 3000;

app.use(cors());

// Route for M3U8 Playlist
app.get('/:channel/stream.m3u8', async (req: Request, res: Response) => {
    const { channel } = req.params;
    const redisKey = `video:${channel}:playlist`;

    try {
        const playlist = await redis.get(redisKey);
        if (playlist) {
            res.setHeader('Content-Type', 'application/x-mpegURL');
            res.send(playlist);
        } else {
            res.status(404).send('Playlist not found');
        }
    } catch (err) {
        console.error(`Redis Error (Playlist): ${err}`);
        res.status(500).send('Error');
    }
});

// Route for TS Video Segments
app.get('/:channel/:segment', async (req: Request, res: Response) => {
    const { channel, segment } = req.params;
    const redisKey = `video:${channel}:seg:${segment}`;

    try {
        const data = await redis.getBuffer(redisKey);
        if (data) {
            res.setHeader('Content-Type', 'video/MP2T');
            res.send(data);
        } else {
            res.status(404).send('Segment not found');
        }
    } catch (err) {
        console.error(`Redis Error (Segment): ${err}`);
        res.status(500).send('Error');
    }
});

export { app };
export default app;

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Backend API (No Cache) is running on port ${PORT}`);
    });
}