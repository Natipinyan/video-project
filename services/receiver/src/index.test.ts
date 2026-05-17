import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import EventEmitter from 'events';
import { startFileWatcher, redis } from './index';

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

vi.mock('fs', () => ({
    readFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn()
}));

class MockWatcher extends EventEmitter {
    constructor() { super(); }
    watch() { return this; }
}
const mockWatcherInstance = new MockWatcher();
vi.mock('chokidar', () => ({
    watch: vi.fn(() => mockWatcherInstance)
}));

describe('Receiver Process Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (redis as any).storage.clear();
    });

    it('should trigger redis update when a .ts segment is discovered by the watcher', async () => {
        const fakeBuffer = Buffer.from('fake-mpegts-stream-content');
        vi.mocked(fs.readFileSync).mockReturnValue(fakeBuffer);

        startFileWatcher();

        await mockWatcherInstance.emit('add', '/app/hls_out/stream0.ts');

        const expectedKey = 'video:default_channel:seg:stream0.ts';
        const record = (redis as any).storage.get(expectedKey);

        expect(record).toBeDefined();
        expect(record.val).toEqual(fakeBuffer);
        expect(record.expiry).toBe(600);
    });

    it('should trigger redis update when the .m3u8 playlist changes', async () => {
        const fakePlaylist = '#EXTM3U\n#EXT-X-VERSION:3';
        vi.mocked(fs.readFileSync).mockReturnValue(fakePlaylist);

        startFileWatcher();

        await mockWatcherInstance.emit('change', '/app/hls_out/stream.m3u8');

        const expectedKey = 'video:default_channel:playlist';
        const record = (redis as any).storage.get(expectedKey);

        expect(record).toBeDefined();
        expect(record.val).toBe(fakePlaylist);
        expect(record.expiry).toBe(30);
    });
});