import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import axios from 'axios';
import { app, redis } from './index';

vi.mock('ioredis', () => {
    return {
        default: class {
            storage = new Map<string, Buffer>();
            async getBuffer(key: string) {
                return this.storage.get(key) || null;
            }
            async set(key: string, val: any, mode?: string, duration?: number) {
                this.storage.set(key, Buffer.from(val));
                return 'OK';
            }
            async ping() {
                return 'PONG';
            }
        }
    };
});

vi.mock('axios');

describe('Edge Server Cache and Route Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (redis as any).storage.clear();
    });

    it('Cache Miss Path: should fetch from backend, store in redis cache, and return 200', async () => {
        const fakeVideoBuffer = Buffer.from('backend-video-bytes');

        vi.mocked(axios.get).mockResolvedValueOnce({
            data: fakeVideoBuffer,
            headers: { 'content-type': 'video/MP2T' }
        });

        const res = await request(app).get('/ch1/stream0.ts');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('video/MP2T');
        expect(res.body.toString()).toBe('backend-video-bytes');

        const cached = await redis.getBuffer('edge:ch1:stream0.ts');
        expect(cached).not.toBeNull();
        expect(cached?.toString()).toBe('backend-video-bytes');
    });

    it('Cache Hit Path: should serve directly from Redis without calling the backend', async () => {
        const cachedBuffer = Buffer.from('cached-video-bytes');
        await redis.set('edge:ch1:stream0.ts', cachedBuffer);

        const res = await request(app).get('/ch1/stream0.ts');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('video/MP2T');
        expect(res.body.toString()).toBe('cached-video-bytes');

        expect(axios.get).not.toHaveBeenCalled();
    });

    it('Upstream Timeout: should return 504 and NOT poison the cache when backend times out', async () => {
        vi.mocked(axios.get).mockRejectedValueOnce({
            code: 'ECONNABORTED',
            message: 'timeout'
        });

        const res = await request(app).get('/ch1/stream0.ts');

        expect(res.status).toBe(504);
        expect(res.text).toBe('Source Unreachable');

        const cached = await redis.getBuffer('edge:ch1:stream0.ts');
        expect(cached).toBeNull();
    });

    // =========================================================================
    // 3. DYNAMIC CHANNELS PROXY TESTS (/channels)
    // =========================================================================
    describe('GET /channels Proxy Path', () => {
        it('should successfully proxy channels array from backend-api', async () => {
            /**
             * PURPOSE: Ensure the Edge server acts as a clean proxy.
             * It should call the Backend API channels endpoint and forward the exact JSON data.
             */
            const mockBackendChannels = [
                { value: 'channel1', label: 'Channel 1', description: 'Test 1' },
                { value: 'channel2', label: 'Channel 2', description: 'Test 2' }
            ];

            vi.mocked(axios.get).mockResolvedValueOnce({
                data: mockBackendChannels,
                headers: { 'content-type': 'application/json' }
            });

            const res = await request(app).get('/channels');

            expect(res.status).toBe(200);
            expect(res.headers['content-type'].toLowerCase()).toContain('application/json');
            expect(res.body).toEqual(mockBackendChannels);

            // מוודאים שאקסיוס אכן חיפש את הראוט הנכון בבקאנד
            expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/channels'), expect.any(Object));
        });

        it('should return 502 Bad Gateway if the backend API fails or is offline', async () => {
            /**
             * PURPOSE: Resiliency check. If the central Backend API is down,
             * the Edge server shouldn't crash; it must return a clear 502 error to the UI.
             */
            vi.mocked(axios.get).mockRejectedValueOnce(new Error('Connection refused'));

            const res = await request(app).get('/channels');

            expect(res.status).toBe(502);
            expect(res.text).toBe('Backend API Unreachable');
        });
    });
});