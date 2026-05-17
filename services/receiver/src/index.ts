import Redis from 'ioredis';
import { spawn } from 'child_process';
import * as path from 'path';
import * as chokidar from 'chokidar';
import * as fs from 'fs';

export const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
export const outputDir = '/app/hls_out';
export const channelName = process.env.CHANNEL_NAME || 'default_channel';

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

export function startFFmpeg() {
    const udpPort = process.env.UDP_PORT || '1234';

    const args = [
        '-i', `udp://0.0.0.0:${udpPort}`,
        '-hls_time', '2',
        '-hls_list_size', '5',
        '-hls_flags', 'delete_segments',
        path.join(outputDir, 'stream.m3u8')
    ];

    console.log(`[${channelName}] Starting FFmpeg conversion...`);
    const ffmpegProcess = spawn('ffmpeg', args);

    ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('frame=')) {
            const lines = output.trim().split('\r');
            console.log(`[FFmpeg - ${channelName}]: ${lines[lines.length - 1].trim()}`);
        }
    });

    return ffmpegProcess;
}

export function startFileWatcher() {
    console.log(`[${channelName}] Monitoring directory: ${outputDir}`);

    const watcher = chokidar.watch(outputDir, {
        ignored: /^\./,
        persistent: true,
        ignoreInitial: false,
        usePolling: true,
        interval: 100,
        binaryInterval: 300
    });

    watcher.on('add', async (filePath) => {
        if (filePath.endsWith('.ts')) {
            const fileName = path.basename(filePath);
            try {
                const fileContent = fs.readFileSync(filePath);
                const redisKey = `video:${channelName}:seg:${fileName}`;
                await redis.set(redisKey, fileContent, 'EX', 600);
                console.log(`[Redis] Stored segment: ${fileName} for ${channelName}`);
            } catch (err) {
                console.error(`Error reading ${fileName}:`, err);
            }
        }
    });

    watcher.on('change', async (filePath) => {
        if (filePath.endsWith('.m3u8')) {
            try {
                const playlistContent = fs.readFileSync(filePath, 'utf8');
                const redisKey = `video:${channelName}:playlist`;
                await redis.set(redisKey, playlistContent, 'EX', 30);
                console.log(`[Redis] Updated playlist for ${channelName}`);
            } catch (err) {
                console.error(`Error updating playlist in Redis:`, err);
            }
        }
    });

    watcher.on('ready', () => console.log(`[${channelName}] Watcher is active.`));

    return watcher;
}

if (process.env.NODE_ENV !== 'test') {
    const ffmpeg = startFFmpeg();
    startFileWatcher();

    process.on('SIGINT', () => {
        ffmpeg.kill();
        redis.disconnect();
        process.exit();
    });
}