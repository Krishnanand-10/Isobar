//! High-performance query engine for spatial-temporal telemetry and atmospheric isobar extraction

use crate::kdtree::SpatialTemporalKDTree;
use crate::math::{bounding_box_from_radius, haversine_distance_km};
use crate::ring_buffer::ColumnarRingBuffer;

pub struct QueryEngine {
    result_buffer: Vec<u32>,
}

impl QueryEngine {
    pub fn new(max_results: usize) -> Self {
        Self {
            result_buffer: vec![0u32; max_results.max(1024)],
        }
    }

    pub fn result_buffer_ptr(&self) -> *const u32 {
        self.result_buffer.as_ptr()
    }

    pub fn result_capacity(&self) -> usize {
        self.result_buffer.len()
    }

    /// Spatial-temporal radius query: "find all points within latitude/longitude radius R in the last T seconds"
    pub fn query_radius(
        &mut self,
        center_lat: f64,
        center_lon: f64,
        radius_km: f64,
        start_time: f64,
        end_time: f64,
        tree: &SpatialTemporalKDTree,
        ring: &ColumnarRingBuffer,
    ) -> usize {
        let (min_lat, min_lon, max_lat, max_lon) = bounding_box_from_radius(center_lat, center_lon, radius_km);
        tree.query_range(
            min_lat,
            min_lon,
            max_lat,
            max_lon,
            start_time,
            end_time,
            center_lat,
            center_lon,
            radius_km,
            ring,
            &mut self.result_buffer,
        )
    }

    /// Spatial bounding box query
    pub fn query_bbox(
        &mut self,
        min_lat: f64,
        min_lon: f64,
        max_lat: f64,
        max_lon: f64,
        start_time: f64,
        end_time: f64,
        tree: &SpatialTemporalKDTree,
        ring: &ColumnarRingBuffer,
    ) -> usize {
        tree.query_range(
            min_lat,
            min_lon,
            max_lat,
            max_lon,
            start_time,
            end_time,
            0.0,
            0.0,
            f64::MAX,
            ring,
            &mut self.result_buffer,
        )
    }

    /// Atmospheric Isobar query: finds all telemetry readings on or near a specific barometric pressure isobar
    pub fn query_isobar(
        &mut self,
        target_pressure: f64,
        tolerance_hpa: f64,
        start_time: f64,
        end_time: f64,
        ring: &ColumnarRingBuffer,
    ) -> usize {
        let count = ring.count;
        if count == 0 {
            return 0;
        }

        let mut matched = 0;
        let start_idx = if ring.count < ring.capacity { 0 } else { ring.head };
        let min_p = target_pressure - tolerance_hpa;
        let max_p = target_pressure + tolerance_hpa;

        for i in 0..count {
            let idx = (start_idx + i) % ring.capacity;
            let t = ring.timestamps[idx];
            if t >= start_time && t <= end_time {
                let p = ring.pressures[idx];
                if p >= min_p && p <= max_p {
                    self.result_buffer[matched] = idx as u32;
                    matched += 1;
                    if matched >= self.result_buffer.len() {
                        break;
                    }
                }
            }
        }

        matched
    }

    /// K-Nearest Neighbors query
    pub fn query_knn(
        &mut self,
        center_lat: f64,
        center_lon: f64,
        k: usize,
        start_time: f64,
        end_time: f64,
        ring: &ColumnarRingBuffer,
    ) -> usize {
        let count = ring.count;
        if count == 0 || k == 0 {
            return 0;
        }

        let k_clamped = k.min(self.result_buffer.len());
        // Simple bounded priority scan for KNN
        let mut best: Vec<(f64, u32)> = Vec::with_capacity(k_clamped + 1);

        let start_idx = if ring.count < ring.capacity { 0 } else { ring.head };
        for i in 0..count {
            let idx = (start_idx + i) % ring.capacity;
            let t = ring.timestamps[idx];
            if t >= start_time && t <= end_time {
                let lat = ring.latitudes[idx];
                let lon = ring.longitudes[idx];
                let dist = haversine_distance_km(center_lat, center_lon, lat, lon);

                if best.len() < k_clamped {
                    best.push((dist, idx as u32));
                    best.sort_unstable_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
                } else if dist < best.last().unwrap().0 {
                    best.pop();
                    best.push((dist, idx as u32));
                    best.sort_unstable_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
                }
            }
        }

        for (i, item) in best.iter().enumerate() {
            self.result_buffer[i] = item.1;
        }

        best.len()
    }

    /// Sequential baseline scan for benchmarking speedup comparison in the UI
    pub fn naive_scan_radius(
        &mut self,
        center_lat: f64,
        center_lon: f64,
        radius_km: f64,
        start_time: f64,
        end_time: f64,
        ring: &ColumnarRingBuffer,
    ) -> usize {
        let count = ring.count;
        if count == 0 {
            return 0;
        }

        let mut matched = 0;
        let start_idx = if ring.count < ring.capacity { 0 } else { ring.head };

        for i in 0..count {
            let idx = (start_idx + i) % ring.capacity;
            let t = ring.timestamps[idx];
            if t >= start_time && t <= end_time {
                let lat = ring.latitudes[idx];
                let lon = ring.longitudes[idx];
                if haversine_distance_km(center_lat, center_lon, lat, lon) <= radius_km {
                    if matched < self.result_buffer.len() {
                        self.result_buffer[matched] = idx as u32;
                    }
                    matched += 1;
                }
            }
        }

        matched.min(self.result_buffer.len())
    }
}
