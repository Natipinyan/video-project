FROM jrottenberg/ffmpeg:4.4-alpine
WORKDIR /app

COPY sample2.mp4 /app/sample2.mp4
ENTRYPOINT ["ffmpeg"]
CMD ["-re", "-stream_loop", "-1", "-i", "/app/sample2.mp4", "-c:v", "libx264", "-preset", "superfast", "-tune", "zerolatency", "-c:a", "aac", "-f", "mpegts", "udp://live-receiver-2:1235"]