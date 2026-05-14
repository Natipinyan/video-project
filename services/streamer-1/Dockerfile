FROM jrottenberg/ffmpeg:4.4-alpine

ENTRYPOINT ["ffmpeg"]
CMD ["-i", "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", "-map", "0:v:2", "-map", "0:a:2", "-c", "copy", "-f", "mpegts", "udp://live-receiver-1:1234"]
