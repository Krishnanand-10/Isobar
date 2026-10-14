import React from 'react';
import { Sliders, Zap, Clock, Compass, Layers, Cpu, Play, Square, Activity, Gauge } from 'lucide-react';

interface QueryPlaygroundProps {
  centerLat: number;
  centerLon: number;
  queryRadiusKm: number;
  timeWindowSec: number;
  indexingMode: 'kdtree' | 'rtree';
  engineMode: 'wasm' | 'typescript';
  isStreaming: boolean;
  ingestRate: number;
  onRateChange: (rate: number) => void;
  onLatChange: (lat: number) => void;
  onLonChange: (lon: number) => void;
  onRadiusChange: (radiusKm: number) => void;
  onTimeWindowChange: (sec: number) => void;
  onIndexingModeChange: (mode: 'kdtree' | 'rtree') => void;
  onEngineModeChange: (mode: 'wasm' | 'typescript') => void;
  onToggleStreaming: () => void;
  onIngestBurst: (count: number) => void;
  onRunBenchmark: () => void;
}

export const QueryPlayground: React.FC<QueryPlaygroundProps> = ({
  centerLat,
  centerLon,
  queryRadiusKm,
  timeWindowSec,
  indexingMode,
  engineMode,
  isStreaming,
  ingestRate,
  onRateChange,
  onLatChange,
  onLonChange,
  onRadiusChange,
  onTimeWindowChange,
  onIndexingModeChange,
  onEngineModeChange,
  onToggleStreaming,
  onIngestBurst,
  onRunBenchmark,
}) => {
  const radiusPresets = [25, 50, 100, 250, 400];
  const timePresets = [
    { label: '15s', sec: 15 },
    { label: '30s', sec: 30 },
    { label: '60s', sec: 60 },
    { label: '5m', sec: 300 },
    { label: '15m', sec: 900 },
  ];

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-xl shadow-xl">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-sky-400" />
          <h3 className="font-sans text-sm font-semibold text-white whitespace-nowrap">
            Query engine
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEngineModeChange(engineMode === 'wasm' ? 'typescript' : 'wasm')}
            className={`whitespace-nowrap inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-sans font-medium transition cursor-pointer select-none ${
              engineMode === 'wasm'
                ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'border-sky-500/40 bg-sky-950/40 text-sky-300'
            }`}
          >
            <Cpu className="h-3 w-3" />
            <span className="whitespace-nowrap font-sans">{engineMode === 'wasm' ? 'WASM (Zero-Copy)' : 'Strict TypedArray'}</span>
          </button>
        </div>
      </div>

      {/* Spatial Center Controls */}
      <div className="space-y-3 font-sans">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span className="flex items-center gap-1.5 text-sky-400">
            <Compass className="h-3.5 w-3.5" /> Focal coordinates
          </span>
          <span className="font-mono text-slate-200">
            {centerLat.toFixed(4)}°N, {centerLon.toFixed(4)}°W
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-300 font-sans">Latitude (-90 to +90)</label>
            <input
              type="number"
              step="0.01"
              value={centerLat}
              onChange={(e) => onLatChange(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-white focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-300 font-sans">Longitude (-180 to +180)</label>
            <input
              type="number"
              step="0.01"
              value={centerLon}
              onChange={(e) => onLonChange(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-white focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Spatial Radius Slider */}
      <div className="space-y-2 font-sans">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300">Query radius</span>
          <span className="font-mono text-sky-300 font-semibold">{queryRadiusKm} km</span>
        </div>
        <input
          type="range"
          min="10"
          max="500"
          step="5"
          value={queryRadiusKm}
          onChange={(e) => onRadiusChange(parseInt(e.target.value))}
          className="w-full accent-amber-400 cursor-pointer"
        />
        <div className="flex justify-between gap-1 pt-1">
          {radiusPresets.map((r) => (
            <button
              key={r}
              onClick={() => onRadiusChange(r)}
              className={`rounded px-2 py-0.5 font-mono text-[10px] transition-colors ${
                queryRadiusKm === r
                  ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {r}km
            </button>
          ))}
        </div>
      </div>

      {/* Temporal Window Filter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Clock className="h-3.5 w-3.5 text-sky-400" /> Temporal Horizon (Δt)
          </span>
          <span className="font-bold text-sky-400">Last {timeWindowSec}s</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {timePresets.map((p) => (
            <button
              key={p.sec}
              onClick={() => onTimeWindowChange(p.sec)}
              className={`rounded-lg py-1.5 font-mono text-xs font-medium transition-all ${
                timeWindowSec === p.sec
                  ? 'border border-sky-500 bg-sky-500/20 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                  : 'border border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Spatial Indexing Algorithm Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-slate-300">
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-purple-400" /> Spatial Index Architecture
          </span>
          <span className="text-[11px] text-purple-300 font-semibold uppercase">{indexingMode}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onIndexingModeChange('kdtree')}
            className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
              indexingMode === 'kdtree'
                ? 'border-purple-500 bg-purple-950/30 text-white shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
            }`}
          >
            <span className="font-mono text-xs font-bold text-purple-300">2D KD-Tree</span>
            <span className="text-[10px] text-slate-400 mt-0.5">Alternating axis median partitioning</span>
          </button>
          <button
            onClick={() => onIndexingModeChange('rtree')}
            className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
              indexingMode === 'rtree'
                ? 'border-purple-500 bg-purple-950/30 text-white shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
            }`}
          >
            <span className="font-mono text-xs font-bold text-purple-300">2D R-Tree</span>
            <span className="text-[10px] text-slate-400 mt-0.5">Hierarchical MBR bounds pruning</span>
          </button>
        </div>
      </div>

      {/* Ingestion Stream Rate Slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Gauge className="h-3.5 w-3.5 text-teal-400" /> Ingestion Velocity
          </span>
          <span className="font-bold text-teal-300">{ingestRate.toLocaleString()} pings/s</span>
        </div>
        <input
          type="range"
          min="500"
          max="20000"
          step="500"
          value={ingestRate}
          onChange={(e) => onRateChange(parseInt(e.target.value))}
          className="w-full accent-teal-400 cursor-pointer"
        />
      </div>

      {/* Stream Ingestion & Benchmark Actions */}
      <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
        <div className="flex gap-2">
          <button
            onClick={onToggleStreaming}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 font-mono text-xs font-bold transition-all ${
              isStreaming
                ? 'bg-rose-500/20 border border-rose-500/50 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.3)] hover:bg-rose-500/30'
                : 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:bg-emerald-500/30'
            }`}
          >
            {isStreaming ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Halt Live Stream</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Stream Telemetry Live</span>
              </>
            )}
          </button>

          <button
            onClick={() => onIngestBurst(10000)}
            className="flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-950/30 px-3.5 py-2.5 font-mono text-xs font-semibold text-sky-300 hover:bg-sky-900/40 transition-colors"
          >
            <Activity className="h-3.5 w-3.5" />
            <span>+10k Burst</span>
          </button>
        </div>

        <button
          onClick={onRunBenchmark}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/60 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 py-2.5 font-mono text-xs font-bold text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.25)] hover:from-amber-500/30 hover:to-yellow-500/30 transition-all"
        >
          <Zap className="h-3.5 w-3.5 fill-current text-amber-400" />
          <span>Execute Microsecond Benchmark</span>
        </button>
      </div>
    </div>
  );
};
