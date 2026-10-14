"use client";

import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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
  const shouldReduceMotion = useReducedMotion();

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
      {/* CLOUD MOTION FRAME: UNTOUCHED COMPONENT & ANIMATION LOOP       */}
      {/* ============================================================== */}
      <CloudShader className="absolute inset-0 pointer-events-none" />

      {/* Subtle atmospheric gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-slate-950/80 pointer-events-none" />

      {/* ============================================================== */}
      {/* NAVBAR                                                         */}
      {/* ============================================================== */}
      <nav className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-3 py-3 sm:px-6 md:px-8 select-none">
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

        <div className="flex items-center gap-2 sm:gap-3">
          {/* 5. WASM (Zero-Copy) single-line badge */}
          <div className="whitespace-nowrap inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/30 backdrop-blur-md px-2.5 py-1 text-[11px] sm:text-xs text-white/90 shadow-sm font-sans">
            <Cpu className="h-3 w-3 text-sky-300" />
            <span className="whitespace-nowrap font-medium">{engineMode === 'wasm' ? 'WASM (Zero-Copy)' : 'Strict TypedArray'}</span>
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
            className="rounded-full bg-white px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold text-sky-700 shadow-md transition hover:bg-white/90 cursor-pointer whitespace-nowrap"
          >
            Live Engine
          </button>
        </div>
      </nav>

      {/* ============================================================== */}
      {/* 1 & 2. HERO SECTION                                            */}
      {/* ============================================================== */}
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-4 pt-10 text-center md:pt-16 select-none">
        {/* Faint radial gradient scrim behind the text block only */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(10,30,60,0.45)_0%,transparent_75%)] blur-2xl pointer-events-none" />

        <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-md md:text-6xl lg:text-7xl font-sans">
          Telemetry above <br className="hidden md:block" /> the clouds
        </h1>

        {/* 1. Subtitle: pure white with soft text-shadow (0 1px 12px rgba(10,30,60,.35)) */}
        <p className="mt-5 max-w-2xl text-base text-white [text-shadow:0_1px_12px_rgba(10,30,60,0.35)] md:text-lg font-sans leading-relaxed">
          Isobar gives your telemetry stream flat columnar circular ring buffers,
          sub-millisecond KD-Tree spatial indexing, and zero GC spikes in Rust WebAssembly.
        </p>

        {/* 2. Buttons: "Start Live Engine" (white primary), "Run Microsecond Benchmark" (dark translucent slate-900/30) */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <button
            onClick={scrollToDashboard}
            className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-sky-700 shadow-lg transition hover:bg-white/90 cursor-pointer flex items-center gap-2 select-none"
          >
            <Radar className="h-4 w-4" />
            <span>Start Live Engine</span>
          </button>

          <button
            onClick={handleRunBenchmark}
            className="rounded-full bg-slate-900/30 text-white border border-white/30 px-6 py-2.5 text-sm font-semibold shadow-md backdrop-blur-sm transition hover:bg-slate-900/50 hover:border-white/50 cursor-pointer flex items-center gap-2 select-none"
          >
            <Zap className="h-4 w-4 text-amber-300 fill-current" />
            <span>Run Microsecond Benchmark</span>
          </button>
        </div>

        {/* 1. Small feature line: pure white with soft text-shadow (0 1px 12px rgba(10,30,60,.35)) */}
        <p className="mt-4 text-xs text-white [text-shadow:0_1px_12px_rgba(10,30,60,0.35)] flex items-center justify-center flex-wrap gap-2 font-sans">
          <span>Rust & WebAssembly Pipeline</span>
          <span className="opacity-60">&middot;</span>
          <span>Zero-Heap JS Boundary</span>
          <span className="opacity-60">&middot;</span>
          <span className="font-mono">26.6M pts/sec</span>
        </p>
      </div>

      {/* ============================================================== */}
      {/* 3. STAT STRIP (3 Glass Cards)                                  */}
      {/* ============================================================== */}
      <div className="relative z-10 mx-auto my-6 sm:my-8 w-full max-w-4xl px-3 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 select-none">
          {/* Card 1: Ingest */}
          <div className="rounded-2xl border border-white/15 bg-slate-900/40 p-4 sm:p-5 backdrop-blur-xl shadow-lg text-center flex flex-col items-center justify-center">
            <span className="font-mono text-2xl sm:text-3xl font-bold text-white tabular-nums tracking-tight">
              26.6M pts/s
            </span>
            <span className="text-xs text-white/70 uppercase tracking-wider mt-1 font-sans font-medium">
              Ingest
            </span>
          </div>

          {/* Card 2: Query Latency */}
          <div className="rounded-2xl border border-white/15 bg-slate-900/40 p-4 sm:p-5 backdrop-blur-xl shadow-lg text-center flex flex-col items-center justify-center">
            <span className="font-mono text-2xl sm:text-3xl font-bold text-sky-300 tabular-nums tracking-tight">
              0.19 ms
            </span>
            <span className="text-xs text-white/70 uppercase tracking-wider mt-1 font-sans font-medium">
              Query latency
            </span>
          </div>

          {/* Card 3: Points Indexed */}
          <div className="rounded-2xl border border-white/15 bg-slate-900/40 p-4 sm:p-5 backdrop-blur-xl shadow-lg text-center flex flex-col items-center justify-center">
            <span className="font-mono text-2xl sm:text-3xl font-bold text-emerald-300 tabular-nums tracking-tight">
              {stats.count > 0 ? stats.count.toLocaleString() : '80,500'}
            </span>
            <span className="text-xs text-white/70 uppercase tracking-wider mt-1 font-sans font-medium">
              Points indexed
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4 & 7. APP PANEL (Single glass card with scroll reveal)        */}
      {/* ============================================================== */}
      <motion.div
        id="dashboard-container"
        initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 mx-auto w-full max-w-6xl px-3 sm:px-6 md:px-8 pb-16"
      >
        <div className="rounded-3xl border border-white/15 bg-slate-900/50 backdrop-blur-2xl p-4 sm:p-6 shadow-2xl min-h-[640px]">
          {/* Top Frame Control Bar (Headings shortened to sentence case, stats moved to stat strip) */}
          <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-3">
            {/* 5. Shortened Sentence-Case Sans-Serif View Tabs */}
            <div className="flex items-center gap-1.5 sm:gap-2 font-sans text-xs sm:text-sm">
              <button
                onClick={() => setViewMode('radar')}
                className={`rounded-lg px-3.5 py-1.5 font-medium transition cursor-pointer select-none flex items-center gap-1.5 whitespace-nowrap ${
                  viewMode === 'radar'
                    ? 'bg-sky-500/20 text-sky-200 border border-sky-400/40 shadow-sm'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                <Radar className="h-3.5 w-3.5" />
                <span>Radar</span>
              </button>

              <button
                onClick={() => setViewMode('isobars')}
                className={`rounded-lg px-3.5 py-1.5 font-medium transition cursor-pointer select-none flex items-center gap-1.5 whitespace-nowrap ${
                  viewMode === 'isobars'
                    ? 'bg-purple-500/20 text-purple-200 border border-purple-400/40 shadow-sm'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                <Wind className="h-3.5 w-3.5" />
                <span>Isobars</span>
              </button>

              <button
                onClick={() => setViewMode('inspector')}
                className={`rounded-lg px-3.5 py-1.5 font-medium transition cursor-pointer select-none flex items-center gap-1.5 whitespace-nowrap ${
                  viewMode === 'inspector'
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 shadow-sm'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>Telemetry</span>
              </button>
            </div>
          </div>

          {/* View Mode Contents */}
          <div>
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
      </motion.div>

      {/* ============================================================== */}
      {/* FOOTER                                                         */}
      {/* ============================================================== */}
      <footer className="relative z-10 border-t border-white/10 bg-slate-950/80 backdrop-blur-md py-8 select-none">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between text-xs font-sans text-white/70 gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">Isobar</span>
            <span>&middot;</span>
            <span>High-throughput in-memory telemetry engine</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-emerald-400 font-sans">Zero-GC flat ring buffers</span>
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
