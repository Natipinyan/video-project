import Redis from 'ioredis';
import { exec, ChildProcess } from 'child_process';
import * as path from 'path';
import * as chokidar from 'chokidar';
import * as fs from 'fs';
const redis = new Redis();
const outputDir = path.resolve(__dirname, '../../../hls_out'); // storage directory for HLS segments

// if the output directory doesn't exist, create it (to avoid FFmpeg errors)
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function startFFmpeg() {
    // FFmpeg Command Breakdown:
    // -i udp... : Input source (MPEG-TS over UDP)
    // -f hls : Output format
    // -hls_time 2 : Target segment duration (2 seconds)
    // -hls_list_size 5 : Keep only the last 5 segments in the playlist
    // -hls_flags delete_segments : Remove old segments from disk (since they are stored in Redis)
    const ffmpegCmd = `ffmpeg -i udp://127.0.0.1:1234 -f hls -hls_time 2 -hls_list_size 5 -hls_flags delete_segments ${path.join(outputDir, 'stream.m3u8')}`;

    console.log("Starting FFmpeg conversion...");
    const ffmpegProcess = exec(ffmpegCmd);

    // Optional: Log FFmpeg output for debugging
    ffmpegProcess.stderr?.on('data', (data) => {
        if (data.includes('frame=')) {
            console.log(`[FFmpeg Status]: ${data.trim().split('\n').pop()}`);
        }
    });

    return ffmpegProcess;
}

// Watch the output directory for new .ts segment files created by FFmpeg
function startFileWatcher() {
    console.log(`👀 Monitoring directory: ${outputDir}`);

    const watcher = chokidar.watch(outputDir, {
        ignored: /^\./, // ignore hidden files
        persistent: true,
        ignoreInitial: true // ignore existing files at startup, only watch for new ones
    });

    // When a new .ts file is added, read it and store it in Redis
    watcher.on('add', async (filePath) => {
        if (filePath.endsWith('.ts')) {
            const fileName = path.basename(filePath);

            try {
                // read the .ts file as a Buffer
                const fileContent = fs.readFileSync(filePath);

                // Save to Redis:
                // Key: video:seg:filename
                // Value: Binary video buffer
                // 'EX', 60: Set Expiration (TTL) to 60 seconds to manage RAM usage
                await redis.set(`video:seg:${fileName}`, fileContent, 'EX', 60);

                console.log(`Stored in Redis: ${fileName}`);
            } catch (err) {
                console.error(`Error processing ${fileName}:`, err);
            }
        }
    });
}

const ffmpeg = startFFmpeg();
startFileWatcher();

process.on('SIGINT', () => {
    console.log("\n Stopping services...");
    ffmpeg.kill();
    redis.disconnect();
    process.exit();
});