export interface Config {
    redisUrl: string;
    outputDir: string;
    channelName: string;
    udpPort: string;
    hlsTime: string;
    hlsListSize: string;
    segmentTtl: number;
    playlistTtl: number;
}

const getEnvConfig = (): Config => {
    const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
    const outputDir = process.env.OUTPUT_DIR || '/dev/shm/hls_out';
    const channelName = process.env.CHANNEL_NAME || 'default_channel';
    const udpPort = process.env.UDP_PORT || '1234';

    const hlsTime = process.env.HLS_SEGMENT_SECONDS || '2';
    const hlsListSize = process.env.HLS_LIST_SIZE || '5';

    const segmentTtl = process.env.HLS_SEGMENT_TTL ? parseInt(process.env.HLS_SEGMENT_TTL, 10) : 600;
    const playlistTtl = process.env.HLS_PLAYLIST_TTL ? parseInt(process.env.HLS_PLAYLIST_TTL, 10) : 300;

    if (isNaN(segmentTtl) || isNaN(playlistTtl)) {
        throw new Error("[CONFIG ERROR]: Redis TTL environment variables must be valid numbers.");
    }

    /* RATIONALE VALIDATION:
    The media segment TTL must be greater than or equal to the sliding playlist window duration
    (calculated as HLS_LIST_SIZE × HLS_SEGMENT_SECONDS).
    This guardrail ensures that historical transport stream (.ts) segments persist in the core memory layout
    and do not expire from the cache prematurely while they are still referenced in the rolling live manifest.
 */
    const calculatedMinSegmentTtl = parseInt(hlsListSize, 10) * parseInt(hlsTime, 10);
    if (!isNaN(calculatedMinSegmentTtl) && segmentTtl < calculatedMinSegmentTtl) {
        console.warn(`[CONFIG WARNING]: HLS_SEGMENT_TTL (${segmentTtl}s) is dangerously lower than list_size × hls_time (${calculatedMinSegmentTtl}s). Stale segments may drop prematurely.`);
    }

    return {
        redisUrl,
        outputDir,
        channelName,
        udpPort,
        hlsTime,
        hlsListSize,
        segmentTtl,
        playlistTtl,
    };
};

export const config = getEnvConfig();