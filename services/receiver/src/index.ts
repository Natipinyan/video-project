//base setup for receiving video stream, converting to HLS, and storing segments in Redis
import Redis from 'ioredis';
import { spawn } from 'child_process';
import * as path from 'path';
import * as chokidar from 'chokidar';
import * as fs from 'fs';

//connect to Redis
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
//path to store HLS output
const outputDir = '/app/hls_out';

//ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

//convert incoming UDP stream to HLS using FFmpeg
function startFFmpeg() {
    const args = [
        '-i', 'udp://0.0.0.0:1234',//input from UDP stream
        '-f', 'hls',//output format
        '-hls_time', '2',//segment duration in seconds
        '-hls_list_size', '5',//number of segments in playlist (delete older segments)
        '-hls_flags', 'delete_segments',//delete old segments from disk
        path.join(outputDir, 'stream.m3u8')//output playlist and segments
    ];

    console.log("Starting FFmpeg conversion...");
    //spawn FFmpeg process
    const ffmpegProcess = spawn('ffmpeg', args);

    //log FFmpeg output for debugging
    ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('frame=')) {
            const lines = output.trim().split('\r');
            console.log(`[FFmpeg]: ${lines[lines.length - 1].trim()}`);
        }
    });
    //handle FFmpeg exit
    ffmpegProcess.on('close', (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
    });

    return ffmpegProcess;
}

//watch output directory for new .ts segments and store them in Redis
function startFileWatcher() {
    console.log(`Monitoring directory: ${outputDir}`);

    //base settings
    const watcher = chokidar.watch(outputDir, {
        ignored: /^\./,//ignore hidden files
        persistent: true,//don't ignore existing files on startup
        ignoreInitial: false,//process existing files on startup
        usePolling: true,//use polling to ensure we catch new files on all platforms
        interval: 100,//polling interval in ms (10 times per second)
        binaryInterval: 300//longer interval for binary files to ensure they're fully written
    });

    //when a new .ts segment is added, read it and store in Redis with a short expiration
    watcher.on('add', async (filePath) => {
        if (filePath.endsWith('.ts')) {//only process .ts segment files
            const fileName = path.basename(filePath);//get just the file name (e.g., segment1.ts)
            try {
                const fileContent = fs.readFileSync(filePath);//read the segment file as a buffer
                await redis.set(`video:seg:${fileName}`, fileContent, 'EX', 60);//store in Redis with 60 second expiration
                console.log(`SUCCESS: Stored ${fileName} in Redis`);
            } catch (err) {
                console.error(`Error reading ${fileName}:`, err);
            }
        }
    });

    watcher.on('ready', () => console.log('Watcher is active and polling...'));
}

//start FFmpeg and file watcher
const ffmpeg = startFFmpeg();
startFileWatcher();

process.on('SIGINT', () => {
    console.log("\n Stopping services...");
    ffmpeg.kill();
    redis.disconnect();
    process.exit();
});