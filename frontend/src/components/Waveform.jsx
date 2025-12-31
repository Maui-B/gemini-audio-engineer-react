import React, { useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";

/**
 * Waveform player + region selection (no backend calls).
 * - Loads a local File via object URL
 * - Creates a draggable + resizable region
 * - Emits selection changes up to parent
 */
export default function Waveform({ file, onSelectionChange }) {
  const containerRef = useRef(null);
  const wsRef = useRef(null);
  const regionRef = useRef(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!containerRef.current || !file) return;

    // 1. Create Object URL locally within the effect
    const audioUrl = URL.createObjectURL(file);

    // Cleanup any previous instance
    if (wsRef.current) {
      wsRef.current.destroy();
      wsRef.current = null;
      regionRef.current = null;
    }

    // 2. Create the Regions plugin instance first
    const wsRegions = RegionsPlugin.create();

    // 3. Create WaveSurfer
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 120,
      normalize: true,
      plugins: [wsRegions],
    });

    wsRef.current = ws;

    ws.on("ready", () => {
      // Guard: if destroyed in the meantime
      if (!wsRef.current) return;

      setIsReady(true);
      const dur = ws.getDuration();
      setDuration(dur);

      // Default region: first 30s (or full duration if shorter)
      const start = 0;
      const end = Math.min(dur, 30);

      // 4. Add region via the plugin instance
      const r = wsRegions.addRegion({
        start,
        end,
        drag: true,
        resize: true,
        color: "rgba(0, 0, 0, 0.1)", // Optional: better visibility
      });

      regionRef.current = r;
      onSelectionChange?.({ startSec: start, endSec: end, durationSec: dur });
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    // 5. Listen to region events on the plugin instance
    wsRegions.on("region-updated", (region) => {
      onSelectionChange?.({
        startSec: region.start,
        endSec: region.end,
        durationSec: ws.getDuration(),
      });
    });

    // Ensure we capture the final state after drag ends
    wsRegions.on("region-out", (region) => {
      onSelectionChange?.({
        startSec: region.start,
        endSec: region.end,
        durationSec: ws.getDuration(),
      });
    });

    ws.load(audioUrl);

    return () => {
      // Cleanup: Destroy WS first, then revoke the URL
      if (ws) ws.destroy();
      URL.revokeObjectURL(audioUrl);
    };
  }, [file, onSelectionChange]);

  const toggle = () => {
    if (!wsRef.current) return;
    wsRef.current.playPause();
  };

  const playRegion = () => {
    const ws = wsRef.current;
    const region = regionRef.current;
    if (!ws || !region) return;

    // v7: ws.play(start, end)
    ws.play(region.start, region.end);
  };

  return (
    <div className="stack">
      <div ref={containerRef} className="card" />
      <div className="kpi">
        <button className="btn secondary" disabled={!isReady} onClick={toggle}>
          {isPlaying ? "Pause" : "Play/Pause"}
        </button>
        <button className="btn secondary" disabled={!isReady} onClick={playRegion}>
          Play Selection
        </button>
        <span className="pill">Duration: {duration.toFixed(2)}s</span>
        <span className="pill">Drag/resize the region to set selection</span>
      </div>
      <div className="muted">
        Tip: if you don’t see a selection box, wait for the waveform to finish loading.
      </div>
    </div>
  );
}
