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

describe('Edge Server Cache and Route Tests (Secured Interservice Pipeline)', () => {
    const MOCK_SECRET_TOKEN = 'test-secure-relay-token-123';

    beforeEach(() => {
        vi.clearAllMocks();
        (redis as any).storage.clear();

        process.env.INTERNAL_AUTH_TOKEN = MOCK_SECRET_TOKEN;
    });

    it('Cache Miss Path: should fetch from backend with secure headers, store in redis cache, and return 200', async () => {
        const fakeVideoBuffer = Buffer.from('backend-video-bytes');

        vi.mocked(axios.get).mockResolvedValueOnce({
            data: fakeVideoBuffer,
            headers: { 'content-type': 'video/MP2T' }
        });

        const res = await request(app).get('/ch1/stream0.ts');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('video/MP2T');
        expect(res.body.toString()).toBe('backend-video-bytes');

        expect(axios.get).toHaveBeenCalledWith(
            expect.stringContaining('/ch1/stream0.ts'),
            expect.objectContaining({
                headers: { 'X-Relay-Token': MOCK_SECRET_TOKEN }
            })
        );

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
        it('should successfully proxy channels array from backend-api with secret headers', async () => {
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

            expect(axios.get).toHaveBeenCalledWith(
                expect.stringContaining('/channels'),
                expect.objectContaining({
                    headers: { 'X-Relay-Token': MOCK_SECRET_TOKEN }
                })
            );
        });

        it('should return 403 Forbidden if backend rejects the credentials with 401', async () => {
            /**
             * PURPOSE: Acceptance Criteria validation.
             * If backend responds with 401 Unauthorized (invalid secret token),
             * Edge must fail closed and return 403 Forbidden to the client.
             */
            vi.mocked(axios.get).mockRejectedValueOnce({
                response: { status: 401, data: 'Unauthorized' }
            });

            const res = await request(app).get('/channels');

            expect(res.status).toBe(403);
            expect(res.text).toContain('Forbidden');
        });

        it('should return 502 Bad Gateway if the backend API fails or is offline', async () => {
            vi.mocked(axios.get).mockRejectedValueOnce(new Error('Connection refused'));

            const res = await request(app).get('/channels');

            expect(res.status).toBe(502);
            expect(res.text).toBe('Backend API Unreachable');
        });
    });
});