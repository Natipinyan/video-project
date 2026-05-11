import express, { Request, Response } from 'express';
import Redis from 'ioredis';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

const app = express();
const redis = new Redis(); // Connects to local Redis
const PORT = 3000;

// Path to the directory where the receiver saves HLS files
const HLS_DIR = path.resolve(__dirname, '../../../hls_out');

// Enable CORS so the browser-based player can access this API
app.use(cors());

/**
 * Route: GET /live.m3u8
 * Serves the HLS Playlist file.
 * This file tells the player which video segments (.ts) to download.
 */
app.get('/live.m3u8', (req: Request, res: Response) => {
    const filePath = path.join(HLS_DIR, 'stream.m3u8');

    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/x-mpegURL');
        // Stream the file directly from disk
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.status(404).send('Stream playlist not found. Is the receiver running?');
    }
});

/**
 * Route: GET /video/:segment
 * Fetches a specific video segment (.ts) from Redis.
 */
app.get('/video/:segment', async (req: Request, res: Response) => {
    const { segment } = req.params;
    const redisKey = `video:seg:${segment}`;

    try {
        // Fetch the binary video data from Redis
        const data = await redis.getBuffer(redisKey);

        if (data) {
            // Set correct header for MPEG Transport Stream
            res.setHeader('Content-Type', 'video/MP2T');
            res.send(data);
        } else {
            console.log(`[API]: Segment ${segment} not found in Redis`);
            res.status(404).send('Segment expired or not found');
        }
    } catch (err) {
        console.error('[API Error]:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(PORT, () => {
    console.log(`Frontend API is running at http://localhost:${PORT}`);
    console.log(`Playlist URL: http://localhost:3000/live.m3u8`);
});