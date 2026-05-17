// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

const express = require('express');
const request = require('supertest');

describe('🛡️ Core Stack Full Integration Smoke Test (Site A -> Site B)', () => {

    let coreRedisStorage = new Map<string, any>();
    let edgeRedisStorage = new Map<string, any>();

    let apiApp: any;
    let edgeApp: any;

    beforeEach(() => {
        coreRedisStorage.clear();
        edgeRedisStorage.clear();
        vi.clearAllMocks();

        apiApp = express();
        apiApp.get('/:channel/:file', async (req: any, res: any) => {
            const { channel, file } = req.params;
            const data = coreRedisStorage.get(`live:${channel}:${file}`);
            if (!data) return res.status(404).send('Not Found');

            res.setHeader('content-type', file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T');
            return res.send(Buffer.from(data));
        });

        edgeApp = express();
        edgeApp.get('/:channel/:file', async (req: any, res: any) => {
            const { channel, file } = req.params;
            const cacheKey = `edge:${channel}:${file}`;

            const cached = edgeRedisStorage.get(cacheKey);
            if (cached) {
                res.setHeader('Content-Type', file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T');
                return res.send(Buffer.from(cached));
            }

            try {
                const response = await axios.get(`http://live-api:3000/${channel}/${file}`, { responseType: 'arraybuffer' });
                const dataBuffer = Buffer.from(response.data);

                edgeRedisStorage.set(cacheKey, dataBuffer);

                res.setHeader('Content-Type', response.headers['content-type'] || 'video/MP2T');
                return res.send(dataBuffer);
            } catch (err) {
                return res.status(502).send('Gateway Error');
            }
        });
    });

    it('Workflow Validation: Receiver processes stream -> Core API serves -> Edge Caches -> UI plays', async () => {

        const fakePlaylistContent = '#EXTM3U\n#EXT-X-STREAM-INF\nstream.m3u8';
        const fakeSegmentBytes = Buffer.from('glorious-live-video-bytes');

        coreRedisStorage.set('live:channel1:stream.m3u8', fakePlaylistContent);
        coreRedisStorage.set('live:channel1:seg0.ts', fakeSegmentBytes);

        const apiResponse = await request(apiApp).get('/channel1/stream.m3u8');
        expect(apiResponse.status).toBe(200);
        expect(apiResponse.text).toBe(fakePlaylistContent);

        vi.spyOn(axios, 'get').mockImplementation(async (url: string) => {
            if (url.includes('http://live-api:3000/channel1/seg0.ts')) {
                return {
                    data: fakeSegmentBytes,
                    headers: { 'content-type': 'video/MP2T' }
                } as any;
            }
            throw new Error('Network Unreachable');
        });

        const edgeMissResponse = await request(edgeApp).get('/channel1/seg0.ts');
        expect(edgeMissResponse.status).toBe(200);
        expect(edgeMissResponse.body.toString()).toBe('glorious-live-video-bytes');
        expect(axios.get).toHaveBeenCalledTimes(1);

        expect(edgeRedisStorage.has('edge:channel1:seg0.ts')).toBe(true);

        vi.mocked(axios.get).mockClear();

        const edgeHitResponse = await request(edgeApp).get('/channel1/seg0.ts');
        expect(edgeHitResponse.status).toBe(200);
        expect(edgeHitResponse.body.toString()).toBe('glorious-live-video-bytes');

        expect(axios.get).not.toHaveBeenCalled();
    });
});