// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('Web UI Component and Smoke Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('VITE_API_URL', 'http://edge-server-test:8080');
    });

    it('Smoke Test: should render the main channels menu without throwing errors', () => {
        render(<App />);

        expect(screen.getByText('CHANNELS')).toBeDefined();
        expect(screen.getByText('Channel 1')).toBeDefined();
        expect(screen.getByText('Channel 2')).toBeDefined();
    });

    it('Channel Selector: clicking a channel should render the video player element', async () => {
        const { container } = render(<App />);

        const cards = screen.getAllByTestId('channel-card-channel1');

        cards.forEach(card => {
            fireEvent.pointerDown(card);
            fireEvent.click(card);
        });

        const videoPlayer = container.querySelector('video');
        expect(videoPlayer).not.toBeNull();
    });

    it('Environment Variable Validation: should build the HLS source URL based on VITE_API_URL', async () => {
        const { container } = render(<App />);

        const cards = screen.getAllByTestId('channel-card-channel2');

        cards.forEach(card => {
            fireEvent.pointerDown(card);
            fireEvent.click(card);
        });

        const videoPlayer = container.querySelector('video');
        expect(videoPlayer).not.toBeNull();

        await vi.waitFor(() => {
            expect(loadSourceMock).toHaveBeenCalledWith(
                'http://edge-server-test:8080/channel2/stream.m3u8'
            );
        });
    });
});