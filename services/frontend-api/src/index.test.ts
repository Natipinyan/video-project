import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import NodeCache from 'node-cache';

// Global variables to control the mocked states
let mockGetValue: any = null;
let mockGetBufferValue: any = null;
let shouldThrowError = false;

// Mocking 'ioredis' to isolate our API from an actual Redis server during tests
vi.mock('ioredis', () => {
    return {
        default: class {
            get() {
                if (shouldThrowError) return Promise.reject(new Error('Redis Error'));
                return Promise.resolve(mockGetValue);
            }

            getBuffer() {
                if (shouldThrowError) return Promise.reject(new Error('Redis Buffer Error'));
                return Promise.resolve(mockGetBufferValue);
            }
            on() { return this; }
        }
    };
});

// Mocking 'node-cache' to allow manual cache clearing between test runs
vi.mock('node-cache', () => {
    class MockNodeCache {
        static instances: any[] = [];
        cache: any;
        constructor(options: any) {
            this.cache = new Map();
            MockNodeCache.instances.push(this);
        }
        get(key: string) { return this.cache.get(key); }
        set(key: string, val: any) { this.cache.set(key, val); return true; }
        flushAll() { this.cache.clear(); }
    }
    return { default: MockNodeCache };
});

import app from './index';
// @ts-ignore
import NodeCacheMock from 'node-cache';

describe('Streaming API Tests', () => {

    beforeEach(() => {
        mockGetValue = null;
        mockGetBufferValue = null;
        shouldThrowError = false;
        (NodeCacheMock as any).instances.forEach((inst: any) => inst.flushAll());
    });

    // =========================================================================
    // 1. PLAYLIST ROUTE TESTS (.m3u8)
    // =========================================================================

    it('should return 404 for unknown channel', async () => {
        /**
         * PURPOSE: Test that requesting an HLS playlist for a channel
         * that does not exist in Redis correctly results in a 404 Not Found error.
         */
        const res = await request(app).get('/unknown/stream.m3u8');
        expect(res.status).toBe(404);
    });

    it('should return 200 and the playlist content when it exists in Redis', async () => {
        /**
         * PURPOSE: Test the successful path where the playlist is found in Redis.
         * The API should return status 200, the playlist text, and the correct
         * HLS content-type header (case-insensitive check).
         */
        const fakePlaylist = '#EXTM3U\n#EXT-X-TARGETDURATION:2\nstream0.ts';
        mockGetValue = fakePlaylist;

        const res = await request(app).get('/channel1/stream.m3u8');

        expect(res.status).toBe(200);
        expect(res.headers['content-type'].toLowerCase()).toContain('application/x-mpegurl');
        expect(res.text).toBe(fakePlaylist);
    });

    it('should return 500 when Redis fails on playlist fetch', async () => {
        /**
         * PURPOSE: Test error handling resiliency. When the Redis server connection
         * fails or throws an exception, the API's try/catch block must catch it,
         * prevent the server from crashing, and safely respond with a 500 Internal Error.
         */
        shouldThrowError = true;

        const res = await request(app).get('/channel1/stream.m3u8');

        expect(res.status).toBe(500);
        expect(res.text).toBe('Error');
    });

    // =========================================================================
    // 2. VIDEO SEGMENT ROUTE TESTS (.ts)
    // =========================================================================

    it('should return 404 when video segment is not found', async () => {
        /**
         * PURPOSE: Test that requesting a specific TS video segment that is missing
         * or expired from Redis correctly returns a 404 Not Found status.
         */
        const res = await request(app).get('/channel1/stream0.ts');
        expect(res.status).toBe(404);
    });

    it('should return 200 and video buffer with correct content-type when segment exists', async () => {
        /**
         * PURPOSE: Test the successful delivery of video stream files.
         * The API must read the binary data buffer from Redis, serve it with a
         * 'video/mp2t' content-type header, and deliver the exact unmodified buffer.
         */
        const fakeVideoBuffer = Buffer.from('fake-mpegts-binary-data');
        mockGetBufferValue = fakeVideoBuffer;

        const res = await request(app).get('/channel1/stream0.ts');

        expect(res.status).toBe(200);
        expect(res.headers['content-type'].toLowerCase()).toContain('video/mp2t');
        expect(res.body).toEqual(fakeVideoBuffer);
    });

    it('should return 500 when Redis fails on segment fetch', async () => {
        /**
         * PURPOSE: Test error handling for binary video fetches. If Redis drops
         * the connection mid-request or errors out while fetching a segment buffer,
         * the route's catch block must capture the error and return a 500 status.
         */
        shouldThrowError = true;

        const res = await request(app).get('/channel1/stream0.ts');

        expect(res.status).toBe(500);
        expect(res.text).toBe('Error');
    });
});