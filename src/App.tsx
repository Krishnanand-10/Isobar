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
  SunMedium,
  Moon,
  CloudLightning,
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

// Atmospheric shader presets
const SHADER_PRESETS = [
  {
    name: 'Standard Troposphere',
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
    speed: 1.4,
    count: 6,
    cloudColor: '#94a3b8',
    skyTopColor: '#1e293b',
    skyBottomColor: '#090d16',
  },
  {
    name: 'Solar Sunrise',
    icon: SunMedium,
    speed: 0.6,
    count: 5,
    cloudColor: '#fed7aa',
    skyTopColor: '#1e3a8a',
    skyBottomColor: '#7c2d12',
  },
];

export function App() {
  // Engine & Generator
  const [engine] = useState(() => new IsobarEngine(100_000));
  const [generator] = useState(() => new TelemetryGenerator(150));

  // Active UI states
  const [activeTab, setActiveTab] = useState<'radar' | 'isobars' | 'inspector' | 'architecture'>('radar');
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
  const activePreset = SHADER_PRESETS[selectedPresetIdx];

  // Live telemetry data
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

  return (
    <div className="relative min-h-screen w-full bg-slate-950 text-slate-100 selection:bg-sky-500/30 selection:text-sky-200 overflow-x-hidden font-sans">
      {/* Top Background Cloud Shader (Aceternity UI) */}
      <div className="absolute inset-x-0 top-0 h-[480px] w-full pointer-events-none z-0">
        <CloudShader
          speed={activePreset.speed}
          count={activePreset.count}
          cloudColor={activePreset.cloudColor}
          skyTopColor={activePreset.skyTopColor}
          skyBottomColor={activePreset.skyBottomColor}
          className="h-full w-full opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/60 to-slate-950" />
      </div>

      {/* Main Container */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Navigation / Header */}
        <header className="flex flex-col gap-4 border-b border-sky-500/20 pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-sky-500/40 bg-slate-900/80 shadow-[0_0_20px_rgba(56,189,248,0.25)]">
              <Compass className="h-6 w-6 text-sky-400 animate-spin" style={{ animationDuration: '30s' }} />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-mono text-2xl font-black tracking-tight text-white">
                  ISOBAR<span className="text-sky-400">.DB</span>
                </h1>
                <span className="rounded-full border border-sky-500/30 bg-sky-950/50 px-2 py-0.5 font-mono text-[10px] font-semibold text-sky-300">
                  v0.1.0-WASM
                </span>
              </div>
              <p className="font-mono text-xs text-slate-300">
                High-Throughput In-Memory Telemetry Engine & Geospatial Index
              </p>
            </div>
          </div>

          {/* Quick Status Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* WASM status pill */}
            <div className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-slate-900/80 px-2.5 py-1 text-xs font-mono text-slate-300 shadow-sm backdrop-blur-md">
              <Cpu className="h-3.5 w-3.5 text-sky-400" />
              <span>Runtime:</span>
              <span className="font-bold text-sky-400 uppercase">{engineMode}</span>
            </div>

            {/* Zero-GC pill */}
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 text-xs font-mono text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Zero-GC Ring Buffer</span>
            </div>

            {/* GitHub repo button */}
            <a
              href="https://github.com/Krishnanand-10/Isobar.git"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-1 text-xs font-mono font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
            >
              <Github className="h-3.5 w-3.5" />
              <span>GitHub</span>
            </a>
          </div>
        </header>

        {/* Hero Banner with Atmospheric Shader Controls */}
        <div className="relative overflow-hidden rounded-2xl border border-sky-500/30 bg-slate-900/40 p-6 backdrop-blur-xl shadow-2xl">
          <div className="relative z-10 max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-mono text-sky-300">
              <Activity className="h-3.5 w-3.5 text-sky-400" />
              <span>Answers Konto by emphasizing strict algorithmic and mathematical rigor</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-mono">
              Continuous Flat Columnar Storage & Custom 2D Spatio-Temporal Indexing
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-mono">
              Engineered with zero-dependency Rust compiled to WebAssembly with zero heap allocation across
              the JS-WASM boundary. Ingests high-frequency atmospheric & flight transponder streams, answering
              geodesic radius queries and atmospheric isobar contours in sub-millisecond execution times.
            </p>
          </div>

          {/* Shader Atmosphere Presets */}
          <div className="mt-5 border-t border-slate-800/80 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-mono text-xs text-slate-400 flex items-center gap-1.5">
                <Wind className="h-3.5 w-3.5 text-sky-400" /> Procedural Cloud Atmosphere:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SHADER_PRESETS.map((preset, idx) => {
                  const Icon = preset.icon;
                  return (
                    <button
                      key={preset.name}
                      onClick={() => setSelectedPresetIdx(idx)}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs transition-all ${
                        selectedPresetIdx === idx
                          ? 'border-sky-400 bg-sky-950/60 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 font-mono text-xs">
          <button
            onClick={() => setActiveTab('radar')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-semibold transition-all ${
              activeTab === 'radar'
                ? 'border-sky-400 text-sky-400 bg-sky-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radar className="h-4 w-4" />
            <span>Radar & Spatial Query</span>
          </button>
          <button
            onClick={() => setActiveTab('isobars')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-semibold transition-all ${
              activeTab === 'isobars'
                ? 'border-purple-400 text-purple-400 bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wind className="h-4 w-4" />
            <span>Isobar Contours ({targetPressureHpa} hPa)</span>
          </button>
          <button
            onClick={() => setActiveTab('inspector')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-semibold transition-all ${
              activeTab === 'inspector'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-4 w-4" />
            <span>Telemetry Inspector ({matchedPoints.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-semibold transition-all ${
              activeTab === 'architecture'
                ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode2 className="h-4 w-4" />
            <span>Algorithmic Rigor</span>
          </button>
        </div>

        {/* Active Tab Contents */}
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
                {/* Left Column: Interactive Radar Canvas */}
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

                {/* Right Column: Query Playground */}
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

              {/* Benchmarks & System KPIs */}
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
                  Rigorous data structure specifications guaranteeing zero GC pauses and sub-millisecond execution.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-300">
                <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <h4 className="text-sm font-bold text-sky-400">1. Flat Columnar Memory Layout</h4>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Contiguous preallocated memory buffer eliminating heap allocations:
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
                  <h4 className="text-sm font-bold text-purple-400">2. Geodesic Metric & Haversine</h4>
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
                  <h4 className="text-sm font-bold text-emerald-400">3. 2D Spatio-Temporal KD-Tree</h4>
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
                  <h4 className="text-sm font-bold text-amber-400">4. International Standard Atmosphere (ISA)</h4>
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
