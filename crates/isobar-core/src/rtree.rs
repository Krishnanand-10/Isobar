//! Custom 2D Spatio-Temporal R-Tree implementation from scratch
//! Flat array-backed node pool with hierarchical Minimum Bounding Rectangles (MBR) and temporal envelopes.

use crate::math::{haversine_distance_km, equirectangular_distance_sq_km};
use crate::ring_buffer::ColumnarRingBuffer;

pub const RTREE_NODE_CAPACITY: usize = 8;

#[derive(Clone, Copy, Debug)]
pub struct MBR {
    pub min_lat: f64,
    pub min_lon: f64,
    pub max_lat: f64,
    pub max_lon: f64,
    pub min_time: f64,
    pub max_time: f64,
}

impl MBR {
    #[inline(always)]
    pub fn empty() -> Self {
        Self {
            min_lat: f64::INFINITY,
            min_lon: f64::INFINITY,
            max_lat: f64::NEG_INFINITY,
            max_lon: f64::NEG_INFINITY,
            min_time: f64::INFINITY,
            max_time: f64::NEG_INFINITY,
        }
    }

    #[inline(always)]
    pub fn from_point(lat: f64, lon: f64, time: f64) -> Self {
        Self {
            min_lat: lat,
            min_lon: lon,
            max_lat: lat,
            max_lon: lon,
            min_time: time,
            max_time: time,
        }
    }

    #[inline(always)]
    pub fn expand_with_point(&mut self, lat: f64, lon: f64, time: f64) {
        self.min_lat = self.min_lat.min(lat);
        self.min_lon = self.min_lon.min(lon);
        self.max_lat = self.max_lat.max(lat);
        self.max_lon = self.max_lon.max(lon);
        self.min_time = self.min_time.min(time);
        self.max_time = self.max_time.max(time);
    }

    #[inline(always)]
    pub fn expand_with_mbr(&mut self, other: &MBR) {
        self.min_lat = self.min_lat.min(other.min_lat);
        self.min_lon = self.min_lon.min(other.min_lon);
        self.max_lat = self.max_lat.max(other.max_lat);
        self.max_lon = self.max_lon.max(other.max_lon);
        self.min_time = self.min_time.min(other.min_time);
        self.max_time = self.max_time.max(other.max_time);
    }

    #[inline(always)]
    pub fn intersects(&self, other_min_lat: f64, other_min_lon: f64, other_max_lat: f64, other_max_lon: f64, other_min_time: f64, other_max_time: f64) -> bool {
        self.min_lat <= other_max_lat
            && self.max_lat >= other_min_lat
            && self.min_lon <= other_max_lon
            && self.max_lon >= other_min_lon
            && self.min_time <= other_max_time
            && self.max_time >= other_min_time
    }
}

#[derive(Clone, Debug)]
pub struct RTreeNode {
    pub mbr: MBR,
    pub is_leaf: bool,
    pub children: [i32; RTREE_NODE_CAPACITY],
    pub child_count: u8,
}

pub struct SpatialTemporalRTree {
    pub nodes: Vec<RTreeNode>,
    pub root: i32,
    indices: Vec<u32>,
}

impl SpatialTemporalRTree {
    pub fn new(capacity: usize) -> Self {
        Self {
            nodes: Vec::with_capacity(capacity / 4 + 16),
            root: -1,
            indices: Vec::with_capacity(capacity),
        }
    }

    pub fn rebuild(&mut self, ring: &ColumnarRingBuffer) {
        self.nodes.clear();
        self.indices.clear();

        let count = ring.count;
        if count == 0 {
            self.root = -1;
            return;
        }

        let start_idx = if ring.count < ring.capacity {
            0
        } else {
            ring.head
        };

        for i in 0..count {
            let idx = (start_idx + i) % ring.capacity;
            self.indices.push(idx as u32);
        }

        // Sort by spatial Morton/Hilbert-like key for packed R-tree
        self.indices.sort_unstable_by(|&a, &b| {
            let lat_a = ring.latitudes[a as usize];
            let lon_a = ring.longitudes[a as usize];
            let lat_b = ring.latitudes[b as usize];
            let lon_b = ring.longitudes[b as usize];

            let ka = ((lat_a + 90.0) * 1000.0) as i64 * 360000 + ((lon_a + 180.0) * 1000.0) as i64;
            let kb = ((lat_b + 90.0) * 1000.0) as i64 * 360000 + ((lon_b + 180.0) * 1000.0) as i64;
            ka.cmp(&kb)
        });

        // Pack leaves
        let mut current_level_nodes: Vec<i32> = Vec::new();
        let mut i = 0;
        while i < self.indices.len() {
            let chunk_end = (i + RTREE_NODE_CAPACITY).min(self.indices.len());
            let mut mbr = MBR::empty();
            let mut children = [-1i32; RTREE_NODE_CAPACITY];
            let mut count = 0;

            for j in i..chunk_end {
                let pt = self.indices[j];
                let lat = ring.latitudes[pt as usize];
                let lon = ring.longitudes[pt as usize];
                let time = ring.timestamps[pt as usize];
                mbr.expand_with_point(lat, lon, time);
                children[count] = pt as i32;
                count += 1;
            }

            let node_id = self.nodes.len() as i32;
            self.nodes.push(RTreeNode {
                mbr,
                is_leaf: true,
                children,
                child_count: count as u8,
            });
            current_level_nodes.push(node_id);
            i = chunk_end;
        }

        // Build upper levels
        while current_level_nodes.len() > 1 {
            let mut next_level: Vec<i32> = Vec::new();
            let mut k = 0;
            while k < current_level_nodes.len() {
                let chunk_end = (k + RTREE_NODE_CAPACITY).min(current_level_nodes.len());
                let mut mbr = MBR::empty();
                let mut children = [-1i32; RTREE_NODE_CAPACITY];
                let mut count = 0;

                for j in k..chunk_end {
                    let child_id = current_level_nodes[j];
                    let child_mbr = self.nodes[child_id as usize].mbr;
                    mbr.expand_with_mbr(&child_mbr);
                    children[count] = child_id;
                    count += 1;
                }

                let node_id = self.nodes.len() as i32;
                self.nodes.push(RTreeNode {
                    mbr,
                    is_leaf: false,
                    children,
                    child_count: count as u8,
                });
                next_level.push(node_id);
                k = chunk_end;
            }
            current_level_nodes = next_level;
        }

        self.root = current_level_nodes.first().copied().unwrap_or(-1);
    }

    pub fn query_range(
        &self,
        min_lat: f64,
        min_lon: f64,
        max_lat: f64,
        max_lon: f64,
        min_time: f64,
        max_time: f64,
        center_lat: f64,
        center_lon: f64,
        radius_km: f64,
        ring: &ColumnarRingBuffer,
        out: &mut [u32],
    ) -> usize {
        if self.root == -1 || out.is_empty() {
            return 0;
        }

        let mut count = 0;
        let has_radius = radius_km < 1e8;
        let rad_sq = radius_km * radius_km;

        self.query_node(
            self.root,
            min_lat,
            min_lon,
            max_lat,
            max_lon,
            min_time,
            max_time,
            center_lat,
            center_lon,
            radius_km,
            rad_sq,
            has_radius,
            ring,
            out,
            &mut count,
        );

        count
    }

    fn query_node(
        &self,
        node_id: i32,
        min_lat: f64,
        min_lon: f64,
        max_lat: f64,
        max_lon: f64,
        min_time: f64,
        max_time: f64,
        center_lat: f64,
        center_lon: f64,
        radius_km: f64,
        rad_sq: f64,
        has_radius: bool,
        ring: &ColumnarRingBuffer,
        out: &mut [u32],
        count: &mut usize,
    ) {
        if node_id == -1 || *count >= out.len() {
            return;
        }

        let node = &self.nodes[node_id as usize];
        if !node.mbr.intersects(min_lat, min_lon, max_lat, max_lon, min_time, max_time) {
            return;
        }

        if node.is_leaf {
            for i in 0..node.child_count as usize {
                if *count >= out.len() {
                    return;
                }
                let pt_idx = node.children[i] as usize;
                let t = ring.timestamps[pt_idx];
                if t >= min_time && t <= max_time {
                    let lat = ring.latitudes[pt_idx];
                    let lon = ring.longitudes[pt_idx];
                    if lat >= min_lat && lat <= max_lat && lon >= min_lon && lon <= max_lon {
                        let matches = if has_radius {
                            let eq_dist_sq = equirectangular_distance_sq_km(center_lat, center_lon, lat, lon);
                            if eq_dist_sq <= rad_sq * 1.05 {
                                haversine_distance_km(center_lat, center_lon, lat, lon) <= radius_km
                            } else {
                                false
                            }
                        } else {
                            true
                        };

                        if matches {
                            out[*count] = pt_idx as u32;
                            *count += 1;
                        }
                    }
                }
            }
        } else {
            for i in 0..node.child_count as usize {
                self.query_node(
                    node.children[i],
                    min_lat,
                    min_lon,
                    max_lat,
                    max_lon,
                    min_time,
                    max_time,
                    center_lat,
                    center_lon,
                    radius_km,
                    rad_sq,
                    has_radius,
                    ring,
                    out,
                    count,
                );
            }
        }
    }
}
