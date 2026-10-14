//! Isobar — High-Throughput In-Memory Telemetry Engine
//! Zero-dependency time-series and geospatial indexing engine written in Rust and compiled to WebAssembly.

pub mod math;
pub mod ring_buffer;
pub mod kdtree;
pub mod rtree;
pub mod query;

use wasm_bindgen::prelude::*;
use ring_buffer::ColumnarRingBuffer;
use kdtree::SpatialTemporalKDTree;
use rtree::SpatialTemporalRTree;
use query::QueryEngine;

#[wasm_bindgen]
pub struct IsobarEngineWasm {
    ring: ColumnarRingBuffer,
    kdtree: SpatialTemporalKDTree,
    rtree: SpatialTemporalRTree,
    query_engine: QueryEngine,
    use_rtree: bool,
}

#[wasm_bindgen]
impl IsobarEngineWasm {
    #[wasm_bindgen(constructor)]
    pub fn new(capacity: usize) -> Self {
        let cap = capacity.max(64);
        Self {
            ring: ColumnarRingBuffer::new(cap),
            kdtree: SpatialTemporalKDTree::new(cap),
            rtree: SpatialTemporalRTree::new(cap),
            query_engine: QueryEngine::new(cap.min(65536)),
            use_rtree: false,
        }
    }

    /// Single point ingestion into columnar circular ring buffer
    #[inline]
    pub fn ingest(
        &mut self,
        timestamp: f64,
        lat: f64,
        lon: f64,
        alt: f64,
        pressure: f64,
        velocity: f64,
        heading: f32,
        entity_id: u32,
    ) -> u32 {
        self.ring.push(timestamp, lat, lon, alt, pressure, velocity, heading, entity_id) as u32
    }

    /// High-throughput batch ingestion from JavaScript Float64Array slices
    pub fn ingest_batch(
        &mut self,
        timestamps: &[f64],
        lats: &[f64],
        lons: &[f64],
        alts: &[f64],
        pressures: &[f64],
        velocities: &[f64],
        headings: &[f32],
        entity_ids: &[u32],
    ) -> usize {
        let len = timestamps.len()
            .min(lats.len())
            .min(lons.len())
            .min(alts.len())
            .min(pressures.len())
            .min(velocities.len())
            .min(headings.len())
            .min(entity_ids.len());

        for i in 0..len {
            self.ring.push(
                timestamps[i],
                lats[i],
                lons[i],
                alts[i],
                pressures[i],
                velocities[i],
                headings[i],
                entity_ids[i],
            );
        }
        len
    }

    /// Rebuilds spatial-temporal index (KD-Tree or R-Tree)
    pub fn rebuild_index(&mut self) {
        if self.use_rtree {
            self.rtree.rebuild(&self.ring);
        } else {
            self.kdtree.rebuild(&self.ring);
        }
    }

    /// Toggle indexing mode between KD-Tree and R-Tree
    pub fn set_indexing_mode(&mut self, use_rtree: bool) {
        self.use_rtree = use_rtree;
        self.rebuild_index();
    }

    /// Spatial-temporal radius query: returns number of matches written to result buffer
    pub fn query_radius(
        &mut self,
        center_lat: f64,
        center_lon: f64,
        radius_km: f64,
        start_time: f64,
        end_time: f64,
    ) -> usize {
        if self.use_rtree {
            let (min_lat, min_lon, max_lat, max_lon) =
                math::bounding_box_from_radius(center_lat, center_lon, radius_km);
            let mut buf = vec![0u32; self.query_engine.result_capacity()];
            let count = self.rtree.query_range(
                min_lat, min_lon, max_lat, max_lon,
                start_time, end_time,
                center_lat, center_lon, radius_km,
                &self.ring, &mut buf,
            );
            // Copy into engine buffer
            unsafe {
                let ptr = self.query_engine.result_buffer_ptr() as *mut u32;
                core::ptr::copy_nonoverlapping(buf.as_ptr(), ptr, count);
            }
            count
        } else {
            self.query_engine.query_radius(
                center_lat,
                center_lon,
                radius_km,
                start_time,
                end_time,
                &self.kdtree,
                &self.ring,
            )
        }
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
    ) -> usize {
        self.query_engine.query_bbox(
            min_lat,
            min_lon,
            max_lat,
            max_lon,
            start_time,
            end_time,
            &self.kdtree,
            &self.ring,
        )
    }

    /// Atmospheric Isobar pressure contour query
    pub fn query_isobar(
        &mut self,
        target_pressure_hpa: f64,
        tolerance_hpa: f64,
        start_time: f64,
        end_time: f64,
    ) -> usize {
        self.query_engine.query_isobar(
            target_pressure_hpa,
            tolerance_hpa,
            start_time,
            end_time,
            &self.ring,
        )
    }

    /// K-Nearest Neighbors query
    pub fn query_knn(
        &mut self,
        center_lat: f64,
        center_lon: f64,
        k: usize,
        start_time: f64,
        end_time: f64,
    ) -> usize {
        self.query_engine.query_knn(
            center_lat,
            center_lon,
            k,
            start_time,
            end_time,
            &self.ring,
        )
    }

    /// Naive brute-force scan for benchmark comparison
    pub fn naive_scan_radius(
        &mut self,
        center_lat: f64,
        center_lon: f64,
        radius_km: f64,
        start_time: f64,
        end_time: f64,
    ) -> usize {
        self.query_engine.naive_scan_radius(
            center_lat,
            center_lon,
            radius_km,
            start_time,
            end_time,
            &self.ring,
        )
    }

    // Zero-Copy Memory Pointers across JS-WASM Boundary

    pub fn get_result_indices_ptr(&self) -> *const u32 {
        self.query_engine.result_buffer_ptr()
    }

    pub fn get_timestamps_ptr(&self) -> *const f64 {
        self.ring.timestamps.as_ptr()
    }

    pub fn get_latitudes_ptr(&self) -> *const f64 {
        self.ring.latitudes.as_ptr()
    }

    pub fn get_longitudes_ptr(&self) -> *const f64 {
        self.ring.longitudes.as_ptr()
    }

    pub fn get_altitudes_ptr(&self) -> *const f64 {
        self.ring.altitudes.as_ptr()
    }

    pub fn get_pressures_ptr(&self) -> *const f64 {
        self.ring.pressures.as_ptr()
    }

    pub fn get_velocities_ptr(&self) -> *const f64 {
        self.ring.velocities.as_ptr()
    }

    pub fn get_headings_ptr(&self) -> *const f32 {
        self.ring.headings.as_ptr()
    }

    pub fn get_entity_ids_ptr(&self) -> *const u32 {
        self.ring.entity_ids.as_ptr()
    }

    pub fn get_capacity(&self) -> usize {
        self.ring.capacity
    }

    pub fn get_count(&self) -> usize {
        self.ring.count
    }

    pub fn get_head(&self) -> usize {
        self.ring.head
    }

    pub fn clear(&mut self) {
        self.ring.clear();
        self.kdtree.nodes.clear();
        self.rtree.nodes.clear();
    }
}
