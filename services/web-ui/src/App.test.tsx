// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import App from './App';

const loadSourceMock = vi.fn();
const attachMediaMock = vi.fn();
const destroyMock = vi.fn();

vi.mock('hls.js', () => {
    return {
        default: class {
            loadSource = loadSourceMock;
            attachMedia = attachMediaMock;
            destroy = destroyMock;
            static isSupported = () => true;
        }
    };
});

const mockChannels = [
    { value: "channel1", label: "Channel 1", description: "Main Network Feed" },
    { value: "channel2", label: "Channel 2", description: "Local Storage Stream" },
];

describe('Web UI Component and Smoke Tests', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        vi.stubEnv('VITE_API_URL', 'http://edge-server-test:8080');

        vi.stubGlobal('fetch', vi.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockChannels),
            })
        ));
    });

    it('Smoke Test: should render the main channels menu without throwing errors', async () => {
        render(<App />);

        expect(await screen.findByText('CHANNELS')).toBeDefined();
        expect(await screen.findByText('Channel 1')).toBeDefined();
        expect(await screen.findByText('Channel 2')).toBeDefined();
    });

    it('Channel Selector: clicking a channel should render the video player element', async () => {
        render(<App />);

        const card = await screen.findByTestId('channel-card-channel1');

        await act(async () => {
            fireEvent.pointerDown(card);
            fireEvent.click(card);
        });

        const videoPlayer = await screen.findByTestId('video-player');
        expect(videoPlayer).toBeDefined();
    });

    it('Environment Variable Validation: should build the HLS source URL based on VITE_API_URL', async () => {
        render(<App />);

        const card = await screen.findByTestId('channel-card-channel2');

        await act(async () => {
            fireEvent.pointerDown(card);
            fireEvent.click(card);
        });

        const videoPlayer = await screen.findByTestId('video-player');
        expect(videoPlayer).toBeDefined();

        await waitFor(() => {
            expect(loadSourceMock).toHaveBeenCalledWith(
                'http://edge-server-test:8080/channel2/stream.m3u8'
            );
        });
    });
});