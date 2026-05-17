import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Monitor, ArrowLeft, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card";

export const streams = [
  { value: "channel1", label: "Channel 1", description: "Main Network Feed" },
  { value: "channel2", label: "Channel 2", description: "Local Storage Stream" },
];

export default function App() {
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (selectedChannel && videoRef.current) {
      const video = videoRef.current;

      // תיקון הבאג: שימוש במשתנה סביבה כפי שנדרש בדו"ח
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const url = `${baseUrl}/${selectedChannel}/stream.m3u8`;

      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        return () => hls.destroy();
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
      }
    }
  }, [selectedChannel]);

  if (!selectedChannel) {
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center p-8 font-sans">
          <div className="max-w-4xl w-full space-y-12">
            <div className="text-center space-y-4">
              <h1 className="text-5xl font-extrabold tracking-tighter italic">CHANNELS</h1>
              <p className="text-zinc-500 text-lg">Select a feed to broadcast</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {streams.map((stream) => (
                  <Card
                      key={stream.value}
                      data-testid={`channel-card-${stream.value}`}
                      className="group cursor-pointer border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all duration-300 transform hover:-translate-y-2 shadow-xl"
                      onClick={() => setSelectedChannel(stream.value)}
                  >
                    <CardContent className="p-8 flex flex-col items-center space-y-6">
                      <div className="p-4 bg-zinc-800 rounded-2xl group-hover:bg-red-600 transition-colors duration-300">
                        <Monitor className="w-12 h-12 text-zinc-400 group-hover:text-white" />
                      </div>
                      <div className="text-center">
                        <h2 className="text-2xl font-bold">{stream.label}</h2>
                        <p className="text-zinc-500 mt-1">{stream.description}</p>
                      </div>
                      <div className="flex items-center text-red-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        <PlayCircle className="w-5 h-5 mr-2" />
                        WATCH NOW
                      </div>
                    </CardContent>
                  </Card>
              ))}
            </div>
          </div>
        </div>
    );
  }

  return (
      <div className="relative h-screen w-screen bg-black overflow-hidden group font-sans">

        <div className="absolute top-0 left-0 w-full p-4 z-50 transition-opacity duration-500 opacity-0 group-hover:opacity-100 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between">
          <Button
              variant="ghost"
              onClick={() => setSelectedChannel(null)}
              className="hover:bg-zinc-800 text-zinc-100 hover:text-white backdrop-blur-sm bg-black/20"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            BACK TO MENU
          </Button>

          <div className="flex items-center space-x-3 uppercase tracking-widest text-xs font-bold text-white bg-black/40 px-4 py-2 rounded-full backdrop-blur-md border border-white/10">
            <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
            <span>LIVE: {streams.find(s => s.value === selectedChannel)?.label}</span>
          </div>
        </div>

        <div className="h-full w-full flex items-center justify-center bg-black">
          <video
              ref={videoRef}
              data-testid="video-player"
              controls
              autoPlay
              muted
              className="h-full w-full object-contain"
          />
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
        video::-webkit-media-controls-panel {
          background-image: linear-gradient(transparent, rgba(0,0,0,0.5)) !important;
        }
      `}} />
      </div>
  );
}