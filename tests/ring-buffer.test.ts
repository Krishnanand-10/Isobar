import { describe, it, expect } from 'vitest';
import { ColumnarRingBufferTS } from '../src/engine/ring-buffer';

describe('ColumnarRingBufferTS', () => {
  it('should initialize with correct typed arrays and zero counts', () => {
    const ring = new ColumnarRingBufferTS(100);
    expect(ring.capacity).toBe(100);
    expect(ring.count).toBe(0);
    expect(ring.head).toBe(0);
    expect(ring.timestamps.length).toBe(100);
    expect(ring.latitudes.length).toBe(100);
  });

  it('should push points sequentially without wrapping before capacity', () => {
    const ring = new ColumnarRingBufferTS(10);
    for (let i = 0; i < 5; i++) {
      const idx = ring.push(1000 + i, 40 + i, -74 + i, 3000, 1013.25, 250, 90, i);
      expect(idx).toBe(i);
    }
    expect(ring.count).toBe(5);
    expect(ring.head).toBe(5);
  });

  it('should wrap around circularly when capacity is exceeded without throwing', () => {
    const ring = new ColumnarRingBufferTS(5);
    for (let i = 0; i < 12; i++) {
      ring.push(1000 + i, 40 + i, -74 + i, 3000, 1013.25, 250, 90, 100 + i);
    }
    expect(ring.count).toBe(5);
    expect(ring.head).toBe(12 % 5); // 2

    // The oldest surviving record is at idx=2, which was overwritten on step 12
    const pt = ring.get(2);
    expect(pt.entityId).toBe(100 + 7); // (12 - 5) = 7
  });

  it('should calculate memory usage correctly', () => {
    const ring = new ColumnarRingBufferTS(1000);
    expect(ring.totalBytes).toBe(56000); // 56 bytes per point
  });
});
