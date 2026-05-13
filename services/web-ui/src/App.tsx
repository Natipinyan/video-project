import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Check, ChevronsUpDown, Monitor } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const streams = [
  { value: "channel1", label: "Channel 1" },
  { value: "channel2", label: "Channel 2" },
];

export default function App() {
  const [open, setOpen] = useState(false);
  const [currentChannel, setCurrentChannel] = useState("channel1");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      const url = `http://localhost:3000/${currentChannel}/stream.m3u8`;

      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        return () => hls.destroy();
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
      }
    }
  }, [currentChannel]);

  return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 p-8 font-sans">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header Section */}
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight">Control Center</h1>

            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[240px] justify-between border-zinc-800 bg-zinc-900">
                  <Monitor className="mr-2 h-4 w-4" />
                  {/* תיקון: שימוש ב-currentChannel */}
                  {streams.find((s) => s.value === currentChannel)?.label || "Select Camera"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-0 bg-zinc-900 border-zinc-800">
                <Command>
                  <CommandInput placeholder="Search camera..." className="text-zinc-50" />
                  <CommandEmpty>No camera found.</CommandEmpty>
                  <CommandGroup>
                    {streams.map((stream) => (
                        <CommandItem
                            key={stream.value}
                            onSelect={() => {
                              // תיקון: עדכון currentChannel
                              setCurrentChannel(stream.value);
                              setOpen(false);
                            }}
                            className="text-zinc-300 hover:bg-zinc-800"
                        >
                          {/* תיקון: סימון ה-V לפי currentChannel */}
                          <Check className={cn("mr-2 h-4 w-4", currentChannel === stream.value ? "opacity-100" : "opacity-0")} />
                          {stream.label}
                        </CommandItem>
                    ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Video Card */}
          <Card className="border-zinc-800 bg-zinc-900 overflow-hidden shadow-2xl">
            <CardHeader className="border-b border-zinc-800 pb-4">
              <CardTitle className="text-sm font-medium flex items-center">
                <div className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse" />
                {/* תיקון: הצגת הלייבל הנכון לפי הערוץ הנבחר */}
                LIVE FEED: {streams.find(s => s.value === currentChannel)?.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="aspect-video bg-black relative">
                <video
                    ref={videoRef}
                    controls
                    autoPlay // הוספתי שיתחיל לנגן אוטומטית במעבר ערוץ
                    muted    // דפדפנים דורשים השתקה בשביל autoPlay
                    className="w-full h-full object-contain"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
  );
}