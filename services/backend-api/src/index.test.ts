import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

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
            ping() {
                return Promise.resolve('PONG');
            }
            on() { return this; }
        }
    };
});

import app from './index';

describe('Streaming API Tests (Secured Interservice Pipeline)', () => {
    const MOCK_SECRET_TOKEN = 'backend-test-secret-123';

    beforeEach(() => {
        mockGetValue = null;
        mockGetBufferValue = null;
        shouldThrowError = false;

        process.env.INTERNAL_AUTH_TOKEN = MOCK_SECRET_TOKEN;
    });

    // =========================================================================
    // 0. SECURITY & AUTHENTICATION BOUNDARY TESTS
    // =========================================================================
    describe('Authentication Middleware Enforcement', () => {
        it('should block requests and return 401 Unauthorized if X-Relay-Token header is missing', async () => {
            const res = await request(app).get('/channels'); // בקשה "ערומה" ללא הדר
            expect(res.status).toBe(401);
            expect(res.text).toContain('Unauthorized');
        });

        it('should block requests and return 401 Unauthorized if X-Relay-Token is invalid', async () => {
            const res = await request(app)
                .get('/channels')
                .set('X-Relay-Token', 'wrong-intruder-token'); // הדר שגוי
            expect(res.status).toBe(401);
        });

        it('should allow public access to /health without any authentication headers', async () => {
            /**
             * PURPOSE: Ensure Docker/Kubernetes health probes do not fail.
             * The /health route must skip the Auth Middleware.
             */
            const res = await request(app).get('/health');
            expect(res.status).toBe(200);
            expect(res.text).toBe('OK');
        });
    });

    // =========================================================================
    // 1. PLAYLIST ROUTE TESTS (.m3u8) - With Valid Credentials
    // =========================================================================
    describe('GET /:channel/stream.m3u8', () => {
        it('should return 404 for unknown channel when authenticated', async () => {
            const res = await request(app)
                .get('/unknown/stream.m3u8')
                .set('X-Relay-Token', MOCK_SECRET_TOKEN);
            expect(res.status).toBe(404);
        });

        it('should return 200 and the playlist content when authorized', async () => {
            const fakePlaylist = '#EXTM3U\n#EXT-X-TARGETDURATION:2\nstream0.ts';
            mockGetValue = fakePlaylist;

            const res = await request(app)
                .get('/channel1/stream.m3u8')
                .set('X-Relay-Token', MOCK_SECRET_TOKEN);

            expect(res.status).toBe(200);
            expect(res.headers['content-type'].toLowerCase()).toContain('application/x-mpegurl');
            expect(res.text).toBe(fakePlaylist);
        });

        it('should return 500 when Redis fails on playlist fetch even if authenticated', async () => {
            shouldThrowError = true;

            const res = await request(app)
                .get('/channel1/stream.m3u8')
                .set('X-Relay-Token', MOCK_SECRET_TOKEN);

            expect(res.status).toBe(500);
            expect(res.text).toBe('Error');
        });
    });

    // =========================================================================
    // 2. VIDEO SEGMENT ROUTE TESTS (.ts) - With Valid Credentials
    // =========================================================================
    describe('GET /:channel/:segment', () => {
        it('should return 404 when video segment is not found but authenticated', async () => {
            const res = await request(app)
                .get('/channel1/stream0.ts')
                .set('X-Relay-Token', MOCK_SECRET_TOKEN);
            expect(res.status).toBe(404);
        });

        it('should return 200 and video buffer when segment exists and authorized', async () => {
            const fakeVideoBuffer = Buffer.from('fake-mpegts-binary-data');
            mockGetBufferValue = fakeVideoBuffer;

            const res = await request(app)
                .get('/channel1/stream0.ts')
                .set('X-Relay-Token', MOCK_SECRET_TOKEN);

            expect(res.status).toBe(200);
            expect(res.headers['content-type'].toLowerCase()).toContain('video/mp2t');
            expect(res.body).toEqual(fakeVideoBuffer);
        });

        it('should return 500 when Redis fails on segment fetch even if authenticated', async () => {
            shouldThrowError = true;

            const res = await request(app)
                .get('/channel1/stream0.ts')
                .set('X-Relay-Token', MOCK_SECRET_TOKEN);

            expect(res.status).toBe(500);
            expect(res.text).toBe('Error');
        });
    });

    // =========================================================================
    // 3. DYNAMIC CONFIGURATION TESTS (/channels) - With Valid Credentials
    // =========================================================================
    describe('GET /channels', () => {
        it('should return 200 and the list of available channels with proper schema when authorized', async () => {
            const res = await request(app)
                .get('/channels')
                .set('X-Relay-Token', MOCK_SECRET_TOKEN);

            expect(res.status).toBe(200);
            expect(res.headers['content-type'].toLowerCase()).toContain('application/json');
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);

            const firstChannel = res.body[0];
            expect(firstChannel).toHaveProperty('value');
            expect(firstChannel).toHaveProperty('label');
            expect(firstChannel).toHaveProperty('description');

            expect(typeof firstChannel.value).toBe('string');
            expect(typeof firstChannel.label).toBe('string');
        });
    });
});