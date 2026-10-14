import React from 'react';
import { Wind, Mountain, Layers, Eye } from 'lucide-react';
import { pressureToAltitudeMeters } from '@/engine/math';

interface IsobarContoursProps {
  targetPressureHpa: number;
  toleranceHpa: number;
  showIsobars: boolean;
  onTargetPressureChange: (pressureHpa: number) => void;
  onToleranceChange: (toleranceHpa: number) => void;
  onToggleShowIsobars: () => void;
  matchedCount: number;
}

const STANDARD_ISOBARS = [
  { level: 1013.25, name: 'MSL Surface', desc: 'Standard Sea Level' },
  { level: 850, name: '850 hPa', desc: '~1,500m Low Level Jet' },
  { level: 700, name: '700 hPa', desc: '~3,000m Troposphere' },
  { level: 500, name: '500 hPa', desc: '~5,500m Planetary Waves' },
  { level: 300, name: '300 hPa', desc: '~9,000m Jet Stream' },
  { level: 200, name: '200 hPa', desc: '~12,000m Stratosphere' },
];

export const IsobarContours: React.FC<IsobarContoursProps> = ({
  targetPressureHpa,
  toleranceHpa,
  showIsobars,
  onTargetPressureChange,
  onToleranceChange,
  onToggleShowIsobars,
  matchedCount,
}) => {
  const equivAltM = Math.round(pressureToAltitudeMeters(targetPressureHpa));
  const equivAltFt = Math.round(equivAltM * 3.28084);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-sky-500/20 bg-slate-950/80 p-5 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Wind className="h-4 w-4 text-purple-400" />
          <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-white">
            Atmospheric Isobar Pressure Extraction
          </h3>
        </div>
        <button
          onClick={onToggleShowIsobars}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono transition-all ${
            showIsobars
              ? 'border-purple-500/60 bg-purple-950/40 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
              : 'border-slate-800 bg-slate-900 text-slate-400'
          }`}
        >
          <Eye className="h-3 w-3" />
          <span>{showIsobars ? 'Isobars Visible' : 'Isobars Hidden'}</span>
        </button>
      </div>

      {/* Target Isobar Selector */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-mono">
          <span className="text-slate-300">Target Isobar Surface:</span>
          <span className="font-bold text-purple-300">{targetPressureHpa} hPa (±{toleranceHpa} hPa)</span>
        </div>

        {/* Standard Atmospheric Levels Pills */}
        <div className="grid grid-cols-3 gap-2">
          {STANDARD_ISOBARS.map((iso) => (
            <button
              key={iso.level}
              onClick={() => onTargetPressureChange(iso.level)}
              className={`flex flex-col items-start rounded-xl border p-2 text-left transition-all ${
                Math.abs(targetPressureHpa - iso.level) < 1
                  ? 'border-purple-500 bg-purple-950/40 text-white shadow-[0_0_10px_rgba(168,85,247,0.25)]'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
              }`}
            >
              <span className="font-mono text-xs font-bold text-purple-300">{iso.name}</span>
              <span className="text-[10px] text-slate-400 mt-0.5 truncate">{iso.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Barometric Altitude Mapping */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
        <div className="flex items-center gap-2">
          <Mountain className="h-4 w-4 text-sky-400" />
          <div>
            <div className="text-[10px] font-mono text-slate-400 uppercase">ISA Pressure Altitude</div>
            <div className="font-mono text-xs font-bold text-sky-300">
              {equivAltM.toLocaleString()} m ({equivAltFt.toLocaleString()} ft / FL{Math.round(equivAltFt / 100)})
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-purple-400" />
          <div>
            <div className="text-[10px] font-mono text-slate-400 uppercase">Sensors On Surface</div>
            <div className="font-mono text-xs font-bold text-purple-300">
              {matchedCount} Pings In Band
            </div>
          </div>
        </div>
      </div>

      {/* Tolerance Slider */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] font-mono text-slate-400">
          <span>Tolerance Band:</span>
          <span>±{toleranceHpa} hPa</span>
        </div>
        <input
          type="range"
          min="5"
          max="50"
          value={toleranceHpa}
          onChange={(e) => onToleranceChange(parseInt(e.target.value))}
          className="w-full accent-purple-400 cursor-pointer"
        />
      </div>
    </div>
  );
};
