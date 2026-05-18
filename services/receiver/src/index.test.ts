import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import EventEmitter from 'events';
import { startFFmpeg, redis, outputDir } from './index';

vi.mock('ioredis', () => {
    return {
        default: class {
            storage = new Map<string, { val: any, expiry: number }>();
            async set(key: string, val: any, mode?: string, duration?: number) {
                this.storage.set(key, { val, expiry: duration || 0 });
                return 'OK';
            }
            async get(key: string) {
                return this.storage.get(key)?.val || null;
            }
        }
    };
});

vi.mock('fs', () => {
    return {
        existsSync: vi.fn(() => true),
        mkdirSync: vi.fn(),
        readdir: vi.fn((dir, cb) => cb(null, ['stream0.ts'])),
        promises: {
            readFile: vi.fn(),
            unlink: vi.fn(() => Promise.resolve())
        }
    };
});

class MockChildProcess extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    kill = vi.fn();
}

vi.mock('child_process', () => ({
    spawn: vi.fn(() => new MockChildProcess())
}));

describe('Receiver High-Performance Stream Tests', () => {
    let mockProcess: any;

    beforeEach(() => {
        vi.clearAllMocks();
        (redis as any).storage.clear();

        mockProcess = startFFmpeg();
    });

    it('should capture FFmpeg stderr output and sync completed .ts segment into Redis', async () => {
        /**
         * PURPOSE: Test that when FFmpeg outputs the log indicating a new segment is writing,
         * the receiver safely reads the previously completed segment from In-Memory (RAM)
         * and writes it to Redis with a 600-second TTL.
         */
        const fakeBuffer = Buffer.from('high-performance-mpegts-bytes');
        vi.mocked(fs.promises.readFile).mockResolvedValue(fakeBuffer as any);

        const ffmpegLog = `[hls @ 0x55cae9df60c0] Opening '${outputDir}/stream1.ts' for writing\n`;

        await mockProcess.stderr.emit('data', Buffer.from(ffmpegLog));

        await vi.waitFor(() => {
            const expectedKey = 'video:default_channel:seg:stream0.ts';
            const record = (redis as any).storage.get(expectedKey);

            expect(record).toBeDefined();
            expect(record?.val).toEqual(fakeBuffer);
            expect(record?.expiry).toBe(600);

            expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining('stream0.ts'));
        });
    });

    it('should detect dynamic changes and update the .m3u8 playlist in Redis', async () => {
        /**
         * PURPOSE: Test playlist updates. When FFmpeg updates frames or files,
         * the receiver must pull the latest version of stream.m3u8 asynchronously
         * and cache it in Redis with a short 30-second expiry window.
         */
        const fakePlaylist = '#EXTM3U\n#EXT-X-TARGETDURATION:2\nstream0.ts';
        vi.mocked(fs.promises.readFile).mockResolvedValue(fakePlaylist as any);

        const ffmpegFrameLog = 'frame=  150 fps= 30 q=-1.0 size=N/A time=00:00:05.00 bitrate=N/A av_interleaved_write_frame()\n';

        await mockProcess.stderr.emit('data', Buffer.from(ffmpegFrameLog));

        await vi.waitFor(() => {
            const expectedKey = 'video:default_channel:playlist';
            const record = (redis as any).storage.get(expectedKey);

            expect(record).toBeDefined();
            expect(record?.val).toBe(fakePlaylist);
            expect(record?.expiry).toBe(30);
        });
    });
});