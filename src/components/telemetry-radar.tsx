import React, { useRef, useEffect, useState, useMemo } from 'react';
import { TelemetryPoint } from '@/engine/types';

interface TelemetryRadarProps {
  points: TelemetryPoint[];
  matchedPoints: TelemetryPoint[];
  centerLat: number;
  centerLon: number;
  queryRadiusKm: number;
  onSelectCenter?: (lat: number, lon: number) => void;
  onRadiusChange?: (radiusKm: number) => void;
  showIsobars: boolean;
  targetPressureHpa: number;
}

export const TelemetryRadar: React.FC<TelemetryRadarProps> = ({
  points,
  matchedPoints,
  centerLat,
  centerLon,
  queryRadiusKm,
  showIsobars,
  targetPressureHpa,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<TelemetryPoint | null>(null);

  // Set of matched point entity IDs for rapid O(1) highlight lookup
  const matchedIds = useMemo(() => {
    return new Set(matchedPoints.map((p) => p.entityId));
  }, [matchedPoints]);

  // Viewport scale: pixels per km
  const radarRangeKm = Math.max(queryRadiusKm * 1.5, 300);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let sweepAngle = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;
      const radiusPx = Math.min(cx, cy) - 20;
      const pxPerKm = radiusPx / radarRangeKm;

      ctx.clearRect(0, 0, width, height);

      // Radar background grid
      ctx.save();

      // Deep space atmospheric background
      const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radiusPx);
      bgGrad.addColorStop(0, 'rgba(8, 20, 40, 0.85)');
      bgGrad.addColorStop(0.8, 'rgba(4, 12, 28, 0.92)');
      bgGrad.addColorStop(1, 'rgba(2, 6, 18, 0.98)');
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.fill();

      // Concentric range rings
      const rings = [0.25, 0.5, 0.75, 1.0];
      ctx.lineWidth = 1;
      for (const fraction of rings) {
        const r = radiusPx * fraction;
        ctx.strokeStyle = fraction === 1.0 ? 'rgba(56, 189, 248, 0.4)' : 'rgba(56, 189, 248, 0.15)';
        ctx.setLineDash(fraction === 1.0 ? [] : [4, 6]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        // Distance label
        ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(`${Math.round(radarRangeKm * fraction)} km`, cx + 6, cy - r + 12);
      }
      ctx.setLineDash([]);

      // Crosshairs
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.beginPath();
      ctx.moveTo(cx - radiusPx, cy);
      ctx.lineTo(cx + radiusPx, cy);
      ctx.moveTo(cx, cy - radiusPx);
      ctx.lineTo(cx, cy + radiusPx);
      ctx.stroke();

      // Sweeping radar beam
      sweepAngle += 0.025;
      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
      sweepGrad.addColorStop(0, 'rgba(45, 212, 191, 0.25)');
      sweepGrad.addColorStop(1, 'rgba(45, 212, 191, 0.0)');

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radiusPx, sweepAngle - 0.35, sweepAngle);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();
      ctx.restore();

      // Query Radius Boundary Highlight Circle
      const queryRadiusPx = queryRadiusKm * pxPerKm;
      ctx.beginPath();
      ctx.arc(cx, cy, queryRadiusPx, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Query circle fill glow
      ctx.fillStyle = 'rgba(234, 179, 8, 0.05)';
      ctx.fill();

      // Atmospheric Isobars: connect points within ±15 hPa of targetPressureHpa
      if (showIsobars) {
        const isobarCandidates: { x: number; y: number; pressure: number }[] = [];
        for (const pt of points) {
          if (Math.abs(pt.pressure - targetPressureHpa) <= 25) {
            // Coordinate transformation
            const kmX = (pt.longitude - centerLon) * 111.0 * Math.cos(centerLat * (Math.PI / 180));
            const kmY = (centerLat - pt.latitude) * 111.0;
            const px = cx + kmX * pxPerKm;
            const py = cy + kmY * pxPerKm;
            if (Math.hypot(px - cx, py - cy) <= radiusPx) {
              isobarCandidates.push({ x: px, y: py, pressure: pt.pressure });
            }
          }
        }

        if (isobarCandidates.length > 2) {
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < isobarCandidates.length - 1; i++) {
            for (let j = i + 1; j < isobarCandidates.length; j++) {
              const d = Math.hypot(isobarCandidates[i].x - isobarCandidates[j].x, isobarCandidates[i].y - isobarCandidates[j].y);
              if (d < 120) {
                ctx.moveTo(isobarCandidates[i].x, isobarCandidates[i].y);
                ctx.lineTo(isobarCandidates[j].x, isobarCandidates[j].y);
              }
            }
          }
          ctx.stroke();
        }
      }

      // Render Telemetry Points / ADS-B Flights
      for (const pt of points) {
        const kmX = (pt.longitude - centerLon) * 111.0 * Math.cos(centerLat * (Math.PI / 180));
        const kmY = (centerLat - pt.latitude) * 111.0;
        const px = cx + kmX * pxPerKm;
        const py = cy + kmY * pxPerKm;

        // Clip to radar circle
        if (Math.hypot(px - cx, py - cy) > radiusPx) continue;

        const isMatched = matchedIds.has(pt.entityId);

        // Heading vector line
        const headRad = (pt.heading - 90) * (Math.PI / 180);
        const vectorLen = 10;
        ctx.strokeStyle = isMatched ? '#34d399' : 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(headRad) * vectorLen, py + Math.sin(headRad) * vectorLen);
        ctx.stroke();

        // Aircraft marker
        ctx.beginPath();
        ctx.arc(px, py, isMatched ? 4.5 : 2.5, 0, Math.PI * 2);

        if (isMatched) {
          ctx.fillStyle = '#10b981'; // Emerald active
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 8;
        } else {
          // Color code by flight altitude
          if (pt.altitude > 10000) {
            ctx.fillStyle = '#a855f7'; // Stratosphere purple
          } else if (pt.altitude > 6000) {
            ctx.fillStyle = '#38bdf8'; // High cruise cyan
          } else {
            ctx.fillStyle = '#22c55e'; // Low altitude green
          }
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label if matched or hovered
        if (isMatched && pt.callsign) {
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.fillText(pt.callsign, px + 6, py - 4);
        }
      }

      // Center Origin Pin
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#eab308';
      ctx.fill();

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [points, matchedIds, centerLat, centerLon, queryRadiusKm, radarRangeKm, showIsobars, targetPressureHpa]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radiusPx = Math.min(cx, cy) - 20;
    const pxPerKm = radiusPx / radarRangeKm;

    // Check if near any telemetry point
    let nearest: TelemetryPoint | null = null;
    let minD = 12; // 12 pixel snap radius

    for (const pt of points) {
      const kmX = (pt.longitude - centerLon) * 111.0 * Math.cos(centerLat * (Math.PI / 180));
      const kmY = (centerLat - pt.latitude) * 111.0;
      const px = cx + kmX * pxPerKm;
      const py = cy + kmY * pxPerKm;

      const d = Math.hypot(px - x, py - y);
      if (d < minD) {
        minD = d;
        nearest = pt;
      }
    }
    setHoveredPoint(nearest);
  };

  return (
    <div className="relative flex flex-col items-center rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl shadow-xl w-full">
      <div className="flex w-full items-center justify-between pb-3 border-b border-white/10 mb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
          </span>
          <h3 className="font-sans text-sm font-semibold text-white whitespace-nowrap">
            Radar
          </h3>
        </div>
        <div className="font-sans text-xs text-slate-300">
          Range: <span className="font-mono text-sky-300 font-semibold">{radarRangeKm} km</span> | Active pings:{' '}
          <span className="font-mono text-emerald-400 font-semibold">{points.length}</span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-sky-500/10">
        <canvas
          ref={canvasRef}
          width={560}
          height={560}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredPoint(null)}
          className="cursor-default block max-w-full h-auto select-none"
        />

        {/* Hover Tooltip */}
        {hoveredPoint && (
          <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-sky-500/40 bg-slate-900/90 p-3 font-mono text-xs text-slate-200 shadow-xl backdrop-blur-md">
            <div className="font-bold text-sky-400 pb-1 border-b border-slate-700/60 flex items-center justify-between gap-4">
              <span>{hoveredPoint.callsign ?? `ENT-${hoveredPoint.entityId}`}</span>
              <span className="text-[10px] text-emerald-400 font-normal">SQUAWK 1200</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1.5 text-[11px]">
              <div>Lat: <span className="text-white">{hoveredPoint.latitude.toFixed(4)}°</span></div>
              <div>Lon: <span className="text-white">{hoveredPoint.longitude.toFixed(4)}°</span></div>
              <div>Alt: <span className="text-white">{Math.round(hoveredPoint.altitude)} m</span></div>
              <div>Pressure: <span className="text-purple-300">{hoveredPoint.pressure.toFixed(1)} hPa</span></div>
              <div>Speed: <span className="text-white">{Math.round(hoveredPoint.velocity)} kts</span></div>
              <div>Heading: <span className="text-white">{Math.round(hoveredPoint.heading)}°</span></div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex w-full items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400"></span> Matched In Radius ({matchedPoints.length})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-purple-400"></span> Isobar Contour ({targetPressureHpa} hPa)
        </span>
        <span className="text-[11px] text-slate-500">Fixed spatial focus (40.7128°N, 74.0060°W)</span>
      </div>
    </div>
  );
};
