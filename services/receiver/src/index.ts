import Redis from 'ioredis';
import { spawn } from 'child_process'; // החלפנו ל-spawn
import * as path from 'path';
import * as chokidar from 'chokidar';
import * as fs from 'fs';

const redis = new Redis();
const outputDir = path.resolve(__dirname, '../../../hls_out');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function startFFmpeg() {
    const args = [
        '-i', 'udp://0.0.0.0:1234',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '5',
        '-hls_flags', 'delete_segments',
        path.join(outputDir, 'stream.m3u8')
    ];

    console.log("🎬 Starting FFmpeg conversion...");

    const ffmpegProcess = spawn('ffmpeg', args);

    ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('frame=')) {
            const lines = output.trim().split('\r');
            console.log(`[FFmpeg]: ${lines[lines.length - 1].trim()}`);
        }
    });

    ffmpegProcess.on('close', (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
    });

    return ffmpegProcess;
}

function startFileWatcher() {
    console.log(`👀 Monitoring directory: ${outputDir}`);

    const watcher = chokidar.watch(outputDir, {
        ignored: /^\./,
        persistent: true,
        ignoreInitial: true
    });

    watcher.on('add', async (filePath) => {
        if (filePath.endsWith('.ts')) {
            const fileName = path.basename(filePath);
            try {
                const fileContent = fs.readFileSync(filePath);
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