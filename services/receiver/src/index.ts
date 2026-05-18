import Redis from 'ioredis';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { config } from './config';

export const redis = new Redis(config.redisUrl);
export const outputDir = config.outputDir;
export const channelName = config.channelName;

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
            // Configurable sliding window (config.segmentTtl) provides sufficient history.
            await redis.set(redisKey, fileContent, 'EX', config.segmentTtl);
            console.log(`[In-Memory Stream] Successfully cached segment ${fileName} for ${channelName}`);

            await fs.promises.unlink(filePath).catch(() => {});
        } else if (fileName.endsWith('.m3u8')) {
            const playlistContent = await fs.promises.readFile(filePath, 'utf8');
            const redisKey = `video:${channelName}:playlist`;

            // RATIONALE: The playlist is a rolling manifest that changes every few seconds.
            // Configurable TTL (config.playlistTtl) ensures stale manifests expire fast if the source streamer drops.
            await redis.set(redisKey, playlistContent, 'EX', config.playlistTtl);
            console.log(`[In-Memory Stream] Updated dynamic playlist for ${channelName}`);
        }
    } catch (err) {
        console.error(`[Receiver Error] Failed processing ${fileName}:`, err);
    }
}

export function startFFmpeg() {
    const args = [
        '-i', `udp://0.0.0.0:${config.udpPort}`,
        '-hls_time', config.hlsTime,
        '-hls_list_size', config.hlsListSize,
        '-hls_flags', 'delete_segments',
        path.join(outputDir, 'stream.m3u8')
    ];

    console.log(`[${channelName}] Starting high-performance In-Memory FFmpeg pipeline on UDP port ${config.udpPort}...`);
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