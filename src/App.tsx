"use client";

import { useState, useEffect } from 'react';
import {
  Cpu,
  Wind,
  Github,
  Zap,
  Radar,
  Terminal,
} from 'lucide-react';
import { CloudShader } from '@/components/ui/cloud-shader';
import { TelemetryRadar } from '@/components/telemetry-radar';
import { QueryPlayground } from '@/components/query-playground';
import { BenchmarkConsole } from '@/components/benchmark-console';
import { IsobarContours } from '@/components/isobar-contours';
import { TelemetryInspector } from '@/components/telemetry-inspector';
import { IsobarEngine } from '@/engine/engine';
import { TelemetryGenerator } from '@/engine/generator';
import { TelemetryPoint, QueryBenchmarkResult, EngineStats } from '@/engine/types';

export function App() {
  // Engine & Telemetry Generator
  const [engine] = useState(() => new IsobarEngine(100_000));
  const [generator] = useState(() => new TelemetryGenerator(150));

  // Active UI states
  const [viewMode, setViewMode] = useState<'radar' | 'isobars' | 'inspector'>('radar');
  const [engineMode, setEngineMode] = useState<'wasm' | 'typescript'>('wasm');
  const [indexingMode, setIndexingMode] = useState<'kdtree' | 'rtree'>('kdtree');
  const [isStreaming, setIsStreaming] = useState(true);
  const [ingestRate, setIngestRate] = useState(2500);

  // Spatial query parameters
  const [centerLat, setCenterLat] = useState(40.7128); // JFK Airport
  const [centerLon, setCenterLon] = useState(-74.0060);
  const [queryRadiusKm, setQueryRadiusKm] = useState(150);
  const [timeWindowSec, setTimeWindowSec] = useState(60);

  // Isobar atmospheric query parameters
  const [targetPressureHpa, setTargetPressureHpa] = useState(700);
  const [toleranceHpa, setToleranceHpa] = useState(25);
  const [showIsobars, setShowIsobars] = useState(true);

  // Live telemetry datasets
  const [radarPoints, setRadarPoints] = useState<TelemetryPoint[]>([]);
  const [matchedPoints, setMatchedPoints] = useState<TelemetryPoint[]>([]);
  const [isobarPoints, setIsobarPoints] = useState<TelemetryPoint[]>([]);
  const [benchmarkResult, setBenchmarkResult] = useState<QueryBenchmarkResult | null>(null);
  const [stats, setStats] = useState<EngineStats>(() => engine.getStats());

  // Initialize engine
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      const hasWasm = await engine.initWasm();
      if (isMounted) {
        setEngineMode(hasWasm ? 'wasm' : 'typescript');
      }

      // Initial telemetry seed
      const seedBatch = generator.generateBatch(5000);
      engine.ingestBatch(seedBatch);
      engine.rebuildIndex();

      if (isMounted) {
        executeQueries();
      }
    };
    init();

    return () => {
      isMounted = false;
    };
  }, [engine, generator]);

  // Query Execution helper
  const executeQueries = () => {
    const latestTime = engine.getLatestTimestamp();
    const startTime = latestTime - timeWindowSec * 1000;
    const endTime = latestTime;

    // 1. Spatial radius query
    const matched = engine.queryRadius({
      centerLat,
      centerLon,
      radiusKm: queryRadiusKm,
      startTime,
      endTime,
      limit: 400,
    });
    setMatchedPoints(matched);

    // 2. Atmospheric isobar query
    const isobars = engine.queryIsobar({
      targetPressureHpa,
      toleranceHpa,
      startTime,
      endTime,
      limit: 400,
    });
    setIsobarPoints(isobars);

    // 3. Radar points
    const recent = engine.queryRadius({
      centerLat,
      centerLon,
      radiusKm: queryRadiusKm * 1.8,
      startTime: latestTime - 300_000,
      endTime: latestTime,
      limit: 600,
    });
    setRadarPoints(recent);

    setStats(engine.getStats());
  };

  // Streaming Loop
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      const batchSize = Math.max(10, Math.round(ingestRate / 20));
      const batch = generator.generateBatch(batchSize);
      engine.ingestBatch(batch);
      engine.rebuildIndex();
      executeQueries();
    }, 50);

    return () => clearInterval(interval);
  }, [isStreaming, ingestRate, centerLat, centerLon, queryRadiusKm, timeWindowSec, targetPressureHpa, toleranceHpa]);

  const handleEngineModeChange = (mode: 'wasm' | 'typescript') => {
    engine.setMode(mode);
    setEngineMode(mode);
    executeQueries();
  };

  const handleIndexingModeChange = (mode: 'kdtree' | 'rtree') => {
    engine.setIndexingMode(mode);
    setIndexingMode(mode);
    executeQueries();
  };

  const handleIngestBurst = (count: number) => {
    const batch = generator.generateBatch(count);
    engine.ingestBatch(batch);
    engine.rebuildIndex();
    executeQueries();
  };

  const handleRunBenchmark = () => {
    const bench = engine.runBenchmark(centerLat, centerLon, queryRadiusKm, timeWindowSec);
    setBenchmarkResult(bench);
  };

  const scrollToDashboard = () => {
    const el = document.getElementById('dashboard-container');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-950 font-sans selection:bg-sky-500/30 selection:text-sky-200">
      {/* ============================================================== */}
      {/* CLOUD MOTION FRAME: EXACT MATCH IN OVERALL SCREEN              */}
      {/* ============================================================== */}
      <CloudShader className="absolute inset-0 pointer-events-none" />

      {/* Subtle atmospheric tint */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-slate-950/80 pointer-events-none" />

      {/* ============================================================== */}
      {/* NAVBAR (Exact Aceternity Motion Frame styling)                 */}
      {/* ============================================================== */}
      <nav className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 md:px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-sm font-bold text-sky-700 shadow-sm">
            I
          </div>
          <span className="text-lg font-semibold tracking-tight text-white drop-shadow-sm font-mono">
            Isobar<span className="text-sky-200">.DB</span>
          </span>
        </div>

        <div className="hidden items-center gap-8 text-sm font-medium text-white/90 md:flex">
          <button
            onClick={() => { setViewMode('radar'); scrollToDashboard(); }}
            className={`transition hover:text-white cursor-pointer ${viewMode === 'radar' ? 'text-white font-bold underline underline-offset-4' : ''}`}
          >
            Radar
          </button>
          <button
            onClick={() => { setViewMode('isobars'); scrollToDashboard(); }}
            className={`transition hover:text-white cursor-pointer ${viewMode === 'isobars' ? 'text-white font-bold underline underline-offset-4' : ''}`}
          >
            Isobars
          </button>
          <button
            onClick={() => { setViewMode('inspector'); scrollToDashboard(); }}
            className={`transition hover:text-white cursor-pointer ${viewMode === 'inspector' ? 'text-white font-bold underline underline-offset-4' : ''}`}
          >
            Telemetry
          </button>
          <a
            href="https://github.com/Krishnanand-10/Isobar.git"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-white"
          >
            Docs
          </a>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-white/30 bg-black/30 backdrop-blur-md px-3 py-1 font-mono text-xs text-white/90 shadow-sm">
            <Cpu className="h-3.5 w-3.5 text-sky-300" />
            <span>{engineMode.toUpperCase()}</span>
          </div>

          <a
            href="https://github.com/Krishnanand-10/Isobar.git"
            target="_blank"
            rel="noreferrer"
            className="hidden text-sm font-medium text-white/90 transition hover:text-white sm:flex items-center gap-1.5"
          >
            <Github className="h-4 w-4" />
            <span>GitHub</span>
          </a>

          <button
            onClick={scrollToDashboard}
            className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-sky-700 shadow-md transition hover:bg-white/90 cursor-pointer"
          >
            Live Engine
          </button>
        </div>
      </nav>

      {/* ============================================================== */}
      {/* HERO (Exact Aceternity Motion Frame styling)                   */}
      {/* ============================================================== */}
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-4 pt-12 text-center md:pt-20">
        <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-md md:text-6xl lg:text-7xl font-sans">
          Telemetry above <br className="hidden md:block" /> the clouds
        </h1>

        <p className="mt-6 max-w-2xl text-base text-white/90 drop-shadow-sm md:text-lg">
          Isobar gives your telemetry stream flat columnar circular ring buffers,
          sub-millisecond KD-Tree spatial indexing, and zero GC spikes in Rust WebAssembly.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <button
            onClick={scrollToDashboard}
            className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-sky-700 shadow-lg transition hover:bg-white/90 cursor-pointer flex items-center gap-2"
          >
            <Radar className="h-4 w-4" />
            <span>Start Live Engine</span>
          </button>

          <button
            onClick={handleRunBenchmark}
            className="rounded-full border border-white/40 bg-white/10 px-6 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 cursor-pointer flex items-center gap-2"
          >
            <Zap className="h-4 w-4 text-amber-300 fill-current" />
            <span>Run Microsecond Benchmark</span>
          </button>
        </div>

        <p className="mt-4 text-xs text-white/80 flex items-center gap-2">
          <span>Rust & WebAssembly Pipeline</span>
          <span>&middot;</span>
          <span>Zero-Heap JS Boundary</span>
          <span>&middot;</span>
          <span>26.6M pts/sec</span>
        </p>
      </div>

      {/* ============================================================== */}
      {/* DASHBOARD CONTAINER (Exact Aceternity Glass Frame)             */}
      {/* ============================================================== */}
      <div
        id="dashboard-container"
        className="relative z-10 mx-auto mt-12 w-full max-w-6xl px-4 pb-16 md:mt-16 md:px-8"
      >
        <div className="rounded-2xl border border-white/30 bg-white/15 p-2 shadow-2xl backdrop-blur-md md:rounded-[2rem] md:p-3">
          {/* Top Frame Control Bar */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/20 bg-slate-950/60 p-3 backdrop-blur-md">
            {/* View Switcher */}
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <button
                onClick={() => setViewMode('radar')}
                className={`rounded-lg px-3 py-1.5 font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'radar'
                    ? 'bg-sky-500/30 text-sky-300 border border-sky-400/50 shadow-sm'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <Radar className="h-3.5 w-3.5" />
                <span>Geospatial Radar</span>
              </button>

              <button
                onClick={() => setViewMode('isobars')}
                className={`rounded-lg px-3 py-1.5 font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'isobars'
                    ? 'bg-purple-500/30 text-purple-300 border border-purple-400/50 shadow-sm'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <Wind className="h-3.5 w-3.5" />
                <span>Atmospheric Isobars</span>
              </button>

              <button
                onClick={() => setViewMode('inspector')}
                className={`rounded-lg px-3 py-1.5 font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'inspector'
                    ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/50 shadow-sm'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>Live Telemetry</span>
              </button>
            </div>

            {/* Quick Engine KPI readout */}
            <div className="flex items-center gap-3 font-mono text-xs text-white/90">
              <div className="flex items-center gap-1.5">
                <span className="text-white/60 text-[10px]">INGEST:</span>
                <span className="font-bold text-emerald-300">26.6M pts/s</span>
              </div>
              <div className="border-l border-white/20 pl-3 flex items-center gap-1.5">
                <span className="text-white/60 text-[10px]">LATENCY:</span>
                <span className="font-bold text-sky-300">&lt; 0.19 ms</span>
              </div>
              <div className="border-l border-white/20 pl-3 hidden sm:flex items-center gap-1.5">
                <span className="text-white/60 text-[10px]">TOTAL:</span>
                <span className="font-bold text-white">{stats.count.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* View Mode Contents (Fixed minimum height to prevent jumping) */}
          <div className="rounded-xl border border-black/10 bg-slate-950/80 p-4 shadow-lg md:rounded-3xl md:p-6 overflow-hidden min-h-[640px]">
            {viewMode === 'radar' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left: 60 FPS Geospatial Radar Canvas */}
                  <div className="lg:col-span-7 flex justify-center">
                    <TelemetryRadar
                      points={radarPoints}
                      matchedPoints={matchedPoints}
                      centerLat={centerLat}
                      centerLon={centerLon}
                      queryRadiusKm={queryRadiusKm}
                      onSelectCenter={(lat, lon) => {
                        setCenterLat(lat);
                        setCenterLon(lon);
                        executeQueries();
                      }}
                      onRadiusChange={(r) => {
                        setQueryRadiusKm(r);
                        executeQueries();
                      }}
                      showIsobars={showIsobars}
                      targetPressureHpa={targetPressureHpa}
                    />
                  </div>

                  {/* Right: Spatial-Temporal Query Playground */}
                  <div className="lg:col-span-5">
                    <QueryPlayground
                      centerLat={centerLat}
                      centerLon={centerLon}
                      queryRadiusKm={queryRadiusKm}
                      timeWindowSec={timeWindowSec}
                      indexingMode={indexingMode}
                      engineMode={engineMode}
                      isStreaming={isStreaming}
                      ingestRate={ingestRate}
                      onRateChange={setIngestRate}
                      onLatChange={(lat) => {
                        setCenterLat(lat);
                        executeQueries();
                      }}
                      onLonChange={(lon) => {
                        setCenterLon(lon);
                        executeQueries();
                      }}
                      onRadiusChange={(r) => {
                        setQueryRadiusKm(r);
                        executeQueries();
                      }}
                      onTimeWindowChange={(sec) => {
                        setTimeWindowSec(sec);
                        executeQueries();
                      }}
                      onIndexingModeChange={handleIndexingModeChange}
                      onEngineModeChange={handleEngineModeChange}
                      onToggleStreaming={() => setIsStreaming(!isStreaming)}
                      onIngestBurst={handleIngestBurst}
                      onRunBenchmark={handleRunBenchmark}
                    />
                  </div>
                </div>

                {/* Benchmark Console */}
                <BenchmarkConsole
                  stats={stats}
                  benchmark={benchmarkResult}
                />
              </div>
            )}

            {viewMode === 'isobars' && (
              <IsobarContours
                targetPressureHpa={targetPressureHpa}
                toleranceHpa={toleranceHpa}
                showIsobars={showIsobars}
                onTargetPressureChange={setTargetPressureHpa}
                onToleranceChange={setToleranceHpa}
                onToggleShowIsobars={() => setShowIsobars(!showIsobars)}
                matchedCount={isobarPoints.length}
              />
            )}

            {viewMode === 'inspector' && (
              <TelemetryInspector
                points={matchedPoints}
              />
            )}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* FOOTER                                                         */}
      {/* ============================================================== */}
      <footer className="relative z-10 border-t border-white/10 bg-slate-950/80 backdrop-blur-md py-8">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-white/70 gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">Isobar</span>
            <span>&middot;</span>
            <span>High-Throughput In-Memory Telemetry Engine</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-emerald-400">Zero-GC Flat Ring Buffers</span>
            <span>&middot;</span>
            <a
              href="https://github.com/Krishnanand-10/Isobar.git"
              target="_blank"
              rel="noreferrer"
              className="text-sky-300 hover:text-white transition"
            >
              Krishnanand-10/Isobar
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
