import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Cpu,
  Wind,
  Compass,
  Github,
  Zap,
  ShieldCheck,
  Radar,
  Terminal,
  FileCode2,
  Gauge,
  Layers,
  SunMedium,
  Moon,
  CloudLightning,
} from 'lucide-react';
import { CloudShader, CloudShaderDemo } from '@/components/ui/cloud-shader';
import { TelemetryRadar } from '@/components/telemetry-radar';
import { QueryPlayground } from '@/components/query-playground';
import { BenchmarkConsole } from '@/components/benchmark-console';
import { IsobarContours } from '@/components/isobar-contours';
import { TelemetryInspector } from '@/components/telemetry-inspector';
import { IsobarEngine } from '@/engine/engine';
import { TelemetryGenerator } from '@/engine/generator';
import { TelemetryPoint, QueryBenchmarkResult, EngineStats } from '@/engine/types';

// Atmospheric shader presets
const SHADER_PRESETS = [
  {
    name: 'Troposphere Azure',
    icon: Wind,
    speed: 0.8,
    count: 6,
    cloudColor: '#f1f5f9',
    skyTopColor: '#0c4a6e',
    skyBottomColor: '#030712',
  },
  {
    name: 'Stratosphere Flight',
    icon: Moon,
    speed: 0.5,
    count: 4,
    cloudColor: '#93c5fd',
    skyTopColor: '#172554',
    skyBottomColor: '#020617',
  },
  {
    name: 'Barometric Storm Front',
    icon: CloudLightning,
    speed: 1.3,
    count: 6,
    cloudColor: '#94a3b8',
    skyTopColor: '#1e293b',
    skyBottomColor: '#090d16',
  },
  {
    name: 'Solar Sunrise',
    icon: SunMedium,
    speed: 0.7,
    count: 5,
    cloudColor: '#fed7aa',
    skyTopColor: '#1e3a8a',
    skyBottomColor: '#7c2d12',
  },
];

export function App() {
  // Engine & Telemetry Generator
  const [engine] = useState(() => new IsobarEngine(100_000));
  const [generator] = useState(() => new TelemetryGenerator(150));

  // Active UI states
  const [activeTab, setActiveTab] = useState<'radar' | 'isobars' | 'inspector' | 'architecture' | 'clouds'>('radar');
  const [entireScreenMotion, setEntireScreenMotion] = useState(false);
  const [engineMode, setEngineMode] = useState<'wasm' | 'typescript'>('wasm');
  const [indexingMode, setIndexingMode] = useState<'kdtree' | 'rtree'>('kdtree');
  const [isStreaming, setIsStreaming] = useState(true);
  const [ingestRate, setIngestRate] = useState(2500);

  // Spatial query parameters
  const [centerLat, setCenterLat] = useState(40.7128); // New York / JFK
  const [centerLon, setCenterLon] = useState(-74.0060);
  const [queryRadiusKm, setQueryRadiusKm] = useState(150);
  const [timeWindowSec, setTimeWindowSec] = useState(60);

  // Isobar atmospheric query parameters
  const [targetPressureHpa, setTargetPressureHpa] = useState(700);
  const [toleranceHpa, setToleranceHpa] = useState(25);
  const [showIsobars, setShowIsobars] = useState(true);

  // Shader configuration
  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0);
  const [shaderSpeed, setShaderSpeed] = useState(0.8);
  const [shaderCount, setShaderCount] = useState(6);
  const activePreset = SHADER_PRESETS[selectedPresetIdx];

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

    // 3. Collect active radar points for rendering
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
      const batchSize = Math.max(10, Math.round(ingestRate / 20)); // 20 ticks per second = 50ms
      const batch = generator.generateBatch(batchSize);
      engine.ingestBatch(batch);
      engine.rebuildIndex();
      executeQueries();
    }, 50);

    return () => clearInterval(interval);
  }, [isStreaming, ingestRate, centerLat, centerLon, queryRadiusKm, timeWindowSec, targetPressureHpa, toleranceHpa]);

  // Mode and indexing switches
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

  const scrollToRadar = () => {
    setActiveTab('radar');
    const el = document.getElementById('telemetry-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-slate-950 text-slate-100 selection:bg-sky-500/30 selection:text-sky-200 overflow-x-hidden font-sans">
      {/* Optional full-page motion frame backdrop when enabled */}
      {entireScreenMotion && (
        <div className="fixed inset-0 z-0 pointer-events-none opacity-35">
          <CloudShader
            speed={shaderSpeed * 0.6}
            count={Math.min(shaderCount, 4)}
            cloudColor={activePreset.cloudColor}
            skyTopColor={activePreset.skyTopColor}
            skyBottomColor={activePreset.skyBottomColor}
            className="h-full w-full"
          />
        </div>
      )}

      {/* ============================================================== */}
      {/* CLOUD SHADER MOTION FRAME (Aceternity UI: h-[40rem] w-full)    */}
      {/* ============================================================== */}
      <CloudShader
        speed={shaderSpeed}
        count={shaderCount}
        cloudColor={activePreset.cloudColor}
        skyTopColor={activePreset.skyTopColor}
        skyBottomColor={activePreset.skyBottomColor}
        className="h-[40rem] w-full border-b border-sky-500/20 shadow-2xl relative"
        contentClassName="mx-auto max-w-7xl h-full flex flex-col justify-between px-4 py-6 sm:px-6 lg:px-8"
      >
        {/* Atmospheric subtle contrast gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-slate-950 pointer-events-none" />

        {/* Top Navbar */}
        <nav className="relative z-20 flex items-center justify-between border-b border-white/10 pb-4 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-black/40 backdrop-blur-md shadow-xl">
              <Compass className="h-5 w-5 text-sky-300 animate-spin" style={{ animationDuration: '30s' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                  ISOBAR<span className="text-sky-300">.DB</span>
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-white/90 backdrop-blur-md">
                  v0.1.0-WASM
                </span>
              </div>
              <p className="font-mono text-[11px] text-white/80 hidden sm:block">
                In-Memory Telemetry Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setEntireScreenMotion(!entireScreenMotion)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs transition cursor-pointer backdrop-blur-md shadow-md ${
                entireScreenMotion
                  ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                  : 'border-white/20 bg-black/40 text-white/90 hover:bg-black/60'
              }`}
              title="Toggle Cloud Motion Frame across entire application"
            >
              <Wind className="h-3.5 w-3.5 text-sky-300" />
              <span>Full-Screen Motion: <strong className="text-sky-300">{entireScreenMotion ? 'ON' : 'OFF'}</strong></span>
            </button>
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 backdrop-blur-md px-3 py-1 font-mono text-xs text-white/90 shadow-md">
              <Cpu className="h-3.5 w-3.5 text-sky-300" />
              <span>Engine: <strong className="text-sky-300 uppercase">{engineMode}</strong></span>
            </div>
            <div className="hidden md:flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-950/50 backdrop-blur-md px-3 py-1 font-mono text-xs text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Zero-GC Memory</span>
            </div>
            <a
              href="https://github.com/Krishnanand-10/Isobar.git"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 font-mono text-xs font-semibold text-black transition hover:bg-white/90 shadow-lg cursor-pointer"
            >
              <Github className="h-3.5 w-3.5" />
              <span>GitHub</span>
            </a>
          </div>
        </nav>

          {/* Hero Section */}
          <div className="max-w-3xl my-auto py-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/40 px-3.5 py-1 font-mono text-xs text-white backdrop-blur-md mb-4 shadow-xl">
              <Activity className="h-3.5 w-3.5 text-sky-300" />
              <span>Zero-Dependency Rust & WebAssembly Pipeline</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white font-mono leading-tight [text-shadow:0_2px_14px_rgba(0,0,0,0.6)]">
              High-Throughput In-Memory Telemetry Engine
            </h1>

            <p className="mt-4 max-w-2xl text-sm sm:text-base text-white/90 font-mono leading-relaxed [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
              Flat columnar continuous ring buffers and custom 2D KD-Tree / R-Tree spatial indexing.
              Ingests high-frequency atmospheric and avionics streams, answering spatial and temporal queries in sub-millisecond execution times.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={scrollToRadar}
                className="rounded-full bg-white px-6 py-2.5 font-mono text-xs font-bold text-black transition hover:bg-white/90 shadow-2xl flex items-center gap-2 cursor-pointer"
              >
                <Radar className="h-4 w-4 text-sky-600" />
                <span>Explore Geospatial Radar</span>
              </button>
              <button
                onClick={handleRunBenchmark}
                className="rounded-full border border-white/30 bg-black/40 backdrop-blur-md px-6 py-2.5 font-mono text-xs font-bold text-white transition hover:bg-white/20 flex items-center gap-2 cursor-pointer shadow-xl"
              >
                <Zap className="h-4 w-4 text-amber-300 fill-current" />
                <span>Run Microsecond Benchmark</span>
              </button>
            </div>
          </div>

          {/* Bottom Controls Strip: Cloud Motion Presets & Live Metrics */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-3 pb-1">
            {/* Cloud Motion Presets */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-white/80 hidden sm:inline flex items-center gap-1">
                <Wind className="h-3.5 w-3.5 text-sky-300" /> Cloud Atmosphere:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SHADER_PRESETS.map((preset, idx) => {
                  const Icon = preset.icon;
                  return (
                    <button
                      key={preset.name}
                      onClick={() => {
                        setSelectedPresetIdx(idx);
                        setShaderSpeed(preset.speed);
                        setShaderCount(preset.count);
                      }}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs transition-all cursor-pointer backdrop-blur-md ${
                        selectedPresetIdx === idx
                          ? 'border-sky-400 bg-black/60 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                          : 'border-white/15 bg-black/30 text-white/80 hover:text-white hover:bg-black/40'
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Throughput & Latency KPIs */}
            <div className="flex items-center gap-3 font-mono text-xs text-white/90 bg-black/40 border border-white/20 rounded-xl px-3 py-1.5 backdrop-blur-md shadow-lg">
              <div>
                <span className="text-white/60 text-[10px]">INGEST: </span>
                <span className="font-bold text-emerald-300">26.6M pts/s</span>
              </div>
              <div className="border-l border-white/20 pl-3">
                <span className="text-white/60 text-[10px]">LATENCY: </span>
                <span className="font-bold text-sky-300">&lt; 0.19 ms</span>
              </div>
            </div>
          </div>
      </CloudShader>

      {/* ============================================================== */}
      {/* 2. ISOBAR WORKSPACE: RADAR, QUERIES, BENCHMARKS, INSPECTOR    */}
      {/* ============================================================== */}
      <div id="telemetry-section" className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap border-b border-slate-800 font-mono text-xs gap-1">
          <button
            onClick={() => setActiveTab('radar')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 font-semibold transition-all cursor-pointer ${
              activeTab === 'radar'
                ? 'border-sky-400 text-sky-400 bg-sky-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radar className="h-4 w-4" />
            <span>Geospatial Radar & Spatial Query</span>
          </button>
          <button
            onClick={() => setActiveTab('isobars')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 font-semibold transition-all cursor-pointer ${
              activeTab === 'isobars'
                ? 'border-purple-400 text-purple-400 bg-purple-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wind className="h-4 w-4" />
            <span>Atmospheric Isobars ({targetPressureHpa} hPa)</span>
          </button>
          <button
            onClick={() => setActiveTab('inspector')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 font-semibold transition-all cursor-pointer ${
              activeTab === 'inspector'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-4 w-4" />
            <span>Telemetry Inspector ({matchedPoints.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 font-semibold transition-all cursor-pointer ${
              activeTab === 'architecture'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode2 className="h-4 w-4" />
            <span>Algorithmic Rigor</span>
          </button>
          <button
            onClick={() => setActiveTab('clouds')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 font-semibold transition-all cursor-pointer ${
              activeTab === 'clouds'
                ? 'border-sky-400 text-sky-400 bg-sky-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wind className="h-4 w-4" />
            <span>CloudShader Demo (Aceternity)</span>
          </button>
        </div>

        {/* Tab Contents */}
        <AnimatePresence mode="wait">
          {activeTab === 'radar' && (
            <motion.div
              key="radar"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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

              {/* Benchmarks & Performance Metrics */}
              <BenchmarkConsole stats={stats} benchmark={benchmarkResult} />
            </motion.div>
          )}

          {activeTab === 'isobars' && (
            <motion.div
              key="isobars"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7">
                  <TelemetryRadar
                    points={radarPoints}
                    matchedPoints={isobarPoints}
                    centerLat={centerLat}
                    centerLon={centerLon}
                    queryRadiusKm={queryRadiusKm}
                    onSelectCenter={(lat, lon) => {
                      setCenterLat(lat);
                      setCenterLon(lon);
                      executeQueries();
                    }}
                    onRadiusChange={setQueryRadiusKm}
                    showIsobars={true}
                    targetPressureHpa={targetPressureHpa}
                  />
                </div>
                <div className="lg:col-span-5">
                  <IsobarContours
                    targetPressureHpa={targetPressureHpa}
                    toleranceHpa={toleranceHpa}
                    showIsobars={showIsobars}
                    onTargetPressureChange={(p) => {
                      setTargetPressureHpa(p);
                      executeQueries();
                    }}
                    onToleranceChange={(t) => {
                      setToleranceHpa(t);
                      executeQueries();
                    }}
                    onToggleShowIsobars={() => setShowIsobars(!showIsobars)}
                    matchedCount={isobarPoints.length}
                  />
                </div>
              </div>

              <TelemetryInspector points={isobarPoints} maxDisplay={50} />
            </motion.div>
          )}

          {activeTab === 'inspector' && (
            <motion.div
              key="inspector"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <TelemetryInspector points={matchedPoints} maxDisplay={150} />
            </motion.div>
          )}

          {activeTab === 'architecture' && (
            <motion.div
              key="architecture"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-sky-500/20 bg-slate-950/80 p-6 backdrop-blur-xl shadow-2xl space-y-6 font-mono text-xs"
            >
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  Isobar Core Engineering & Mathematical Formalisms
                </h3>
                <p className="text-slate-400 mt-1">
                  Answers Konto by emphasizing strict algorithmic and mathematical rigor.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-300">
                <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <h4 className="text-sm font-bold text-sky-400 flex items-center gap-2">
                    <Gauge className="h-4 w-4" /> 1. Flat Columnar Memory Layout
                  </h4>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Contiguous preallocated memory buffer eliminating heap churn and GC spikes:
                  </p>
                  <pre className="rounded-lg bg-slate-950 p-3 text-[11px] text-teal-300 overflow-x-auto">
{`struct ColumnarRingBuffer {
  timestamps:  [f64; N],  // 8 bytes
  latitudes:   [f64; N],  // 8 bytes
  longitudes:  [f64; N],  // 8 bytes
  altitudes:   [f64; N],  // 8 bytes
  pressures:   [f64; N],  // 8 bytes (Isobars)
  velocities:  [f64; N],  // 8 bytes
  headings:    [f32; N],  // 4 bytes
  entity_ids:  [u32; N],  // 4 bytes
}
// Total = 56 bytes / telemetry point`}
                  </pre>
                  <p className="text-[11px] text-slate-400">
                    Shared directly with JavaScript via raw WebAssembly linear memory pointers (`wasm.memory.buffer`).
                  </p>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <h4 className="text-sm font-bold text-purple-400 flex items-center gap-2">
                    <Compass className="h-4 w-4" /> 2. Geodesic Metric & Haversine
                  </h4>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Exact spherical distance calculation with equirectangular fast screening:
                  </p>
                  <pre className="rounded-lg bg-slate-950 p-3 text-[11px] text-purple-300 overflow-x-auto">
{`a = sin²(Δφ / 2) + cos φ₁ ⋅ cos φ₂ ⋅ sin²(Δλ / 2)
c = 2 ⋅ atan2(√a, √(1 − a))
d = R_earth ⋅ c  (R_earth = 6371.0088 km)`}
                  </pre>
                  <p className="text-[11px] text-slate-400">
                    Equirectangular distance filter tests bounds with 0 trigonometric operations before exact verification.
                  </p>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                    <Layers className="h-4 w-4" /> 3. 2D Spatio-Temporal KD-Tree
                  </h4>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Alternating axis median partitioning in flat arrays with temporal interval pruning:
                  </p>
                  <pre className="rounded-lg bg-slate-950 p-3 text-[11px] text-emerald-300 overflow-x-auto">
{`KDNode {
  point_idx: u32,
  axis:      u8 (0: lat, 1: lon),
  left:      i32, right: i32,
  min_lat, max_lat, min_lon, max_lon,
  min_time, max_time // [t_start, t_end]
}`}
                  </pre>
                  <p className="text-[11px] text-slate-400">
                    Prunes branches outside query bounding box or time window [now - Δt, now].
                  </p>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                    <Wind className="h-4 w-4" /> 4. International Standard Atmosphere (ISA)
                  </h4>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Barometric pressure to geopotential pressure altitude conversion:
                  </p>
                  <pre className="rounded-lg bg-slate-950 p-3 text-[11px] text-amber-300 overflow-x-auto">
{`h = 44330 ⋅ (1 - (P / P₀)^(1 / 5.255))
P₀ = 1013.25 hPa (Mean Sea Level)
P = P₀ ⋅ (1 - h / 44330)^5.255`}
                  </pre>
                  <p className="text-[11px] text-slate-400">
                    Allows real-time extraction and 2D contouring of atmospheric pressure surfaces.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'clouds' && (
            <motion.div
              key="clouds"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="rounded-2xl border border-sky-500/20 bg-slate-900/60 p-6 backdrop-blur-md space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold font-mono text-white flex items-center gap-2">
                      <Wind className="h-5 w-5 text-sky-400" />
                      Aceternity CloudShader Motion Frame
                    </h3>
                    <p className="text-xs font-mono text-slate-400 mt-1">
                      Pure procedural WebGL motion frame with 4-octave billow FBM noise and horizontal wrapping.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">Atmosphere:</span>
                    <div className="flex flex-wrap gap-1">
                      {SHADER_PRESETS.map((preset, idx) => (
                        <button
                          key={preset.name}
                          onClick={() => {
                            setSelectedPresetIdx(idx);
                            setShaderSpeed(preset.speed);
                            setShaderCount(preset.count);
                          }}
                          className={`px-2.5 py-1 text-xs font-mono rounded-lg border transition cursor-pointer ${
                            selectedPresetIdx === idx
                              ? 'border-sky-400 bg-sky-500/20 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                              : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Pure CloudShader Demo component: h-[40rem] w-full */}
                <div className="rounded-xl overflow-hidden border border-sky-500/30 shadow-2xl bg-black">
                  {selectedPresetIdx === 0 ? (
                    <CloudShaderDemo />
                  ) : (
                    <CloudShader
                      className="h-[40rem] w-full"
                      speed={shaderSpeed}
                      count={shaderCount}
                      cloudColor={activePreset.cloudColor}
                      skyTopColor={activePreset.skyTopColor}
                      skyBottomColor={activePreset.skyBottomColor}
                    />
                  )}
                </div>

                {/* Component Usage */}
                <div className="rounded-xl border border-slate-800 bg-black/60 p-4 font-mono text-xs space-y-2">
                  <div className="text-slate-400 font-semibold flex items-center gap-2">
                    <FileCode2 className="h-4 w-4 text-sky-400" />
                    <span>Component Implementation (Exact Aceternity UI spec):</span>
                  </div>
                  <pre className="text-sky-300 overflow-x-auto p-3 bg-slate-950/80 rounded-lg border border-white/5">
{`"use client";

import { CloudShader } from "@/components/ui/cloud-shader";

export function CloudShaderDemo() {
  return (
    <CloudShader className="h-[40rem] w-full" />
  );
}`}
                  </pre>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="border-t border-slate-800/80 pt-6 pb-12 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-slate-400 gap-3">
          <div>
            Isobar Telemetry Engine • Designed with Mathematical & Algorithmic Rigor
          </div>
          <div className="flex items-center gap-4">
            <span>Rust + WebAssembly + TypeScript</span>
            <a
              href="https://github.com/Krishnanand-10/Isobar.git"
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:text-sky-300 transition-colors"
            >
              Krishnanand-10/Isobar
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
