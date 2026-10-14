import React, { useState } from 'react';
import { TelemetryPoint } from '@/engine/types';
import { Plane, Terminal, ArrowUpDown } from 'lucide-react';

interface TelemetryInspectorProps {
  points: TelemetryPoint[];
  maxDisplay?: number;
}

export const TelemetryInspector: React.FC<TelemetryInspectorProps> = ({ points, maxDisplay = 100 }) => {
  const [sortField, setSortField] = useState<keyof TelemetryPoint>('timestamp');
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (field: keyof TelemetryPoint) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedPoints = [...points].sort((a, b) => {
    const valA = (a[sortField] ?? 0) as number;
    const valB = (b[sortField] ?? 0) as number;
    return sortAsc ? valA - valB : valB - valA;
  }).slice(0, maxDisplay);

  return (
    <div className="flex flex-col rounded-2xl border border-sky-500/20 bg-slate-950/80 p-5 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-emerald-400" />
          <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-white">
            Live Columnar Telemetry Stream Inspector
          </h3>
        </div>
        <div className="font-mono text-xs text-slate-400">
          Showing <span className="text-emerald-400 font-bold">{sortedPoints.length}</span> of {points.length} records
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left font-mono text-[11px] text-slate-300">
          <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
            <tr>
              <th className="py-2 px-2.5">
                <button onClick={() => handleSort('entityId')} className="flex items-center gap-1 hover:text-white">
                  Entity ID <ArrowUpDown className="h-2.5 w-2.5" />
                </button>
              </th>
              <th className="py-2 px-2.5">Callsign</th>
              <th className="py-2 px-2.5">
                <button onClick={() => handleSort('latitude')} className="flex items-center gap-1 hover:text-white">
                  Coordinates <ArrowUpDown className="h-2.5 w-2.5" />
                </button>
              </th>
              <th className="py-2 px-2.5">
                <button onClick={() => handleSort('altitude')} className="flex items-center gap-1 hover:text-white">
                  Altitude <ArrowUpDown className="h-2.5 w-2.5" />
                </button>
              </th>
              <th className="py-2 px-2.5">
                <button onClick={() => handleSort('pressure')} className="flex items-center gap-1 hover:text-white">
                  Pressure (hPa) <ArrowUpDown className="h-2.5 w-2.5" />
                </button>
              </th>
              <th className="py-2 px-2.5">
                <button onClick={() => handleSort('velocity')} className="flex items-center gap-1 hover:text-white">
                  Speed <ArrowUpDown className="h-2.5 w-2.5" />
                </button>
              </th>
              <th className="py-2 px-2.5">Heading</th>
              <th className="py-2 px-2.5">Time (ms)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {sortedPoints.map((pt, i) => (
              <tr key={i} className="hover:bg-slate-900/50 transition-colors">
                <td className="py-1.5 px-2.5 text-slate-400">#{pt.entityId}</td>
                <td className="py-1.5 px-2.5 font-bold text-sky-400 flex items-center gap-1">
                  <Plane className="h-2.5 w-2.5" />
                  {pt.callsign ?? `FL-${pt.entityId}`}
                </td>
                <td className="py-1.5 px-2.5">
                  {pt.latitude.toFixed(3)}°, {pt.longitude.toFixed(3)}°
                </td>
                <td className="py-1.5 px-2.5 text-emerald-400">
                  {Math.round(pt.altitude)} m <span className="text-[9px] text-slate-500">FL{Math.round(pt.altitude * 3.28084 / 100)}</span>
                </td>
                <td className="py-1.5 px-2.5 text-purple-300 font-semibold">
                  {pt.pressure.toFixed(1)}
                </td>
                <td className="py-1.5 px-2.5">
                  {Math.round(pt.velocity)} kts
                </td>
                <td className="py-1.5 px-2.5">
                  {Math.round(pt.heading)}°
                </td>
                <td className="py-1.5 px-2.5 text-slate-400 text-[10px]">
                  {pt.timestamp.toFixed(1)}
                </td>
              </tr>
            ))}
            {sortedPoints.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-500 font-mono text-xs">
                  No telemetry records currently matched in active spatial-temporal query window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
