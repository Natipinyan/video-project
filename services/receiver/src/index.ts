import Redis from 'ioredis';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

export const outputDir = '/dev/shm/hls_out';
export const channelName = process.env.CHANNEL_NAME || 'default_channel';

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

async function processCompletedFile(filePath: string) {
    const fileName = path.basename(filePath);
    try {
        if (fileName.endsWith('.ts')) {
            const fileContent = await fs.promises.readFile(filePath);
            const redisKey = `video:${channelName}:seg:${fileName}`;

            // RATIONALE: Media segments are immutable but high in bandwidth/memory.
            // A 10-minute sliding window (EX 600) provides sufficient buffering history
            // for late-joining edge servers or dynamic client DVR scrubbing without overflowing Redis memory.
            await redis.set(redisKey, fileContent, 'EX', 600);
            console.log(`[In-Memory Stream] Successfully cached segment ${fileName} for ${channelName}`);

            await fs.promises.unlink(filePath).catch(() => {});
        } else if (fileName.endsWith('.m3u8')) {
            const playlistContent = await fs.promises.readFile(filePath, 'utf8');
            const redisKey = `video:${channelName}:playlist`;

            // RATIONALE: The playlist is a rolling manifest that changes every 2 seconds (-hls_time 2).
            // A 30-second short TTL (EX 30) ensures that if the source streamer crashes or drops out,
            // the stale manifest expires quickly from the cache, preventing players from entering endless buffering loops.
            await redis.set(redisKey, playlistContent, 'EX', 30);
            console.log(`[In-Memory Stream] Updated dynamic playlist for ${channelName}`);
        }
    } catch (err) {
        console.error(`[Receiver Error] Failed processing ${fileName}:`, err);
    }
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

    console.log(`[${channelName}] Starting high-performance In-Memory FFmpeg pipeline...`);
    const ffmpegProcess = spawn('ffmpeg', args);

    ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();

        const segmentMatch = output.match(/Opening '([^']+)' for writing/);
        if (segmentMatch && segmentMatch[1]) {
            const fullPath = segmentMatch[1];
            fs.readdir(outputDir, (err, files) => {
                if (!err) {
                    files.forEach(file => {
                        if (file.endsWith('.ts') && !fullPath.includes(file)) {
                            processCompletedFile(path.join(outputDir, file));
                        }
                    });
                }
            });
        }

        if (output.includes('av_interleaved_write_frame()') || output.includes('frame=')) {
            const playlistPath = path.join(outputDir, 'stream.m3u8');
            if (fs.existsSync(playlistPath)) {
                processCompletedFile(playlistPath);
            }
        }

        if (output.includes('frame=')) {
            const lines = output.trim().split('\r');
            console.log(`[FFmpeg - ${channelName}]: ${lines[lines.length - 1].trim()}`);
        }
    });

    return ffmpegProcess;
}

if (process.env.NODE_ENV !== 'test') {
    const ffmpeg = startFFmpeg();

    process.on('SIGINT', () => {
        ffmpeg.kill();
        redis.disconnect();
        process.exit();
    });
}