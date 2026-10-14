//! Custom 2D Spatio-Temporal KD-Tree for sub-millisecond range and radius queries
//! Zero heap allocations during query execution. Nodes are laid out in a flat preallocated array.

use crate::math::{haversine_distance_km, equirectangular_distance_sq_km};
use crate::ring_buffer::ColumnarRingBuffer;

#[derive(Clone, Copy, Debug)]
pub struct KDNode {
    pub point_idx: u32,
    pub axis: u8, // 0 = Latitude, 1 = Longitude
    pub left: i32,
    pub right: i32,
    pub min_lat: f64,
    pub max_lat: f64,
    pub min_lon: f64,
    pub max_lon: f64,
    pub min_time: f64,
    pub max_time: f64,
}

pub struct SpatialTemporalKDTree {
    pub nodes: Vec<KDNode>,
    pub root: i32,
    indices: Vec<u32>,
}

impl SpatialTemporalKDTree {
    pub fn new(capacity: usize) -> Self {
        Self {
            nodes: Vec::with_capacity(capacity),
            root: -1,
            indices: Vec::with_capacity(capacity),
        }
    }

    /// Rebuilds the KD-tree over the current valid records in the ring buffer.
    pub fn rebuild(&mut self, ring: &ColumnarRingBuffer) {
        self.nodes.clear();
        self.indices.clear();

        let count = ring.count;
        if count == 0 {
            self.root = -1;
            return;
        }

        // Collect valid indices
        let start_idx = if ring.count < ring.capacity {
            0
        } else {
            ring.head
        };

        for i in 0..count {
            let idx = (start_idx + i) % ring.capacity;
            self.indices.push(idx as u32);
        }

        let len = self.indices.len();
        self.root = self.build_recursive(0, len, 0, ring);
    }

    fn build_recursive(
        &mut self,
        start: usize,
        end: usize,
        depth: usize,
        ring: &ColumnarRingBuffer,
    ) -> i32 {
        if start >= end {
            return -1;
        }

        let axis = (depth % 2) as u8;
        let mid = start + (end - start) / 2;

        // Partition around median along current axis
        Self::select_kth(&mut self.indices[start..end], mid - start, axis, ring);

        let point_idx = self.indices[mid];
        let lat = ring.latitudes[point_idx as usize];
        let lon = ring.longitudes[point_idx as usize];
        let time = ring.timestamps[point_idx as usize];

        let node_id = self.nodes.len() as i32;
        // Temporary placeholder node
        self.nodes.push(KDNode {
            point_idx,
            axis,
            left: -1,
            right: -1,
            min_lat: lat,
            max_lat: lat,
            min_lon: lon,
            max_lon: lon,
            min_time: time,
            max_time: time,
        });

        let left_child = self.build_recursive(start, mid, depth + 1, ring);
        let right_child = self.build_recursive(mid + 1, end, depth + 1, ring);

        // Update bounds from children
        let mut min_lat = lat;
        let mut max_lat = lat;
        let mut min_lon = lon;
        let mut max_lon = lon;
        let mut min_time = time;
        let mut max_time = time;

        if left_child != -1 {
            let l = &self.nodes[left_child as usize];
            min_lat = min_lat.min(l.min_lat);
            max_lat = max_lat.max(l.max_lat);
            min_lon = min_lon.min(l.min_lon);
            max_lon = max_lon.max(l.max_lon);
            min_time = min_time.min(l.min_time);
            max_time = max_time.max(l.max_time);
        }

        if right_child != -1 {
            let r = &self.nodes[right_child as usize];
            min_lat = min_lat.min(r.min_lat);
            max_lat = max_lat.max(r.max_lat);
            min_lon = min_lon.min(r.min_lon);
            max_lon = max_lon.max(r.max_lon);
            min_time = min_time.min(r.min_time);
            max_time = max_time.max(r.max_time);
        }

        let curr = &mut self.nodes[node_id as usize];
        curr.left = left_child;
        curr.right = right_child;
        curr.min_lat = min_lat;
        curr.max_lat = max_lat;
        curr.min_lon = min_lon;
        curr.max_lon = max_lon;
        curr.min_time = min_time;
        curr.max_time = max_time;

        node_id
    }

    /// Fast QuickSelect algorithm to partition around kth element in O(N) average time
    fn select_kth(slice: &mut [u32], k: usize, axis: u8, ring: &ColumnarRingBuffer) {
        if slice.len() <= 1 {
            return;
        }

        let mut left = 0;
        let mut right = slice.len() - 1;

        while left < right {
            let pivot_idx = left + (right - left) / 2;
            let pivot_val = if axis == 0 {
                ring.latitudes[slice[pivot_idx] as usize]
            } else {
                ring.longitudes[slice[pivot_idx] as usize]
            };

            slice.swap(pivot_idx, right);
            let mut store = left;

            for i in left..right {
                let val = if axis == 0 {
                    ring.latitudes[slice[i] as usize]
                } else {
                    ring.longitudes[slice[i] as usize]
                };

                if val < pivot_val {
                    slice.swap(i, store);
                    store += 1;
                }
            }

            slice.swap(store, right);

            if store == k {
                return;
            } else if store < k {
                left = store + 1;
            } else {
                if store == 0 {
                    return;
                }
                right = store - 1;
            }
        }
    }

    /// Queries all points within a spatial bounding box and temporal interval.
    /// If radius_km is finite, applies exact Haversine filter with equirectangular fast pre-filter.
    #[inline]
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

        self.query_recursive(
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

    #[inline(always)]
    fn query_recursive(
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

        // 1. Prune temporal envelope: if query window does not intersect node window, stop.
        if min_time > node.max_time || max_time < node.min_time {
            return;
        }

        // 2. Prune spatial bounding box: if query bbox does not intersect node bbox, stop.
        if min_lat > node.max_lat || max_lat < node.min_lat || min_lon > node.max_lon || max_lon < node.min_lon {
            return;
        }

        // 3. Test current point
        let pt_idx = node.point_idx as usize;
        let pt_time = ring.timestamps[pt_idx];

        if pt_time >= min_time && pt_time <= max_time {
            let pt_lat = ring.latitudes[pt_idx];
            let pt_lon = ring.longitudes[pt_idx];

            if pt_lat >= min_lat && pt_lat <= max_lat && pt_lon >= min_lon && pt_lon <= max_lon {
                let matches = if has_radius {
                    // Fast equirectangular check first
                    let eq_dist_sq = equirectangular_distance_sq_km(center_lat, center_lon, pt_lat, pt_lon);
                    if eq_dist_sq <= rad_sq * 1.05 {
                        haversine_distance_km(center_lat, center_lon, pt_lat, pt_lon) <= radius_km
                    } else {
                        false
                    }
                } else {
                    true
                };

                if matches {
                    out[*count] = node.point_idx;
                    *count += 1;
                    if *count >= out.len() {
                        return;
                    }
                }
            }
        }

        // 4. Branch traversal based on split axis
        let split_val = if node.axis == 0 {
            ring.latitudes[pt_idx]
        } else {
            ring.longitudes[pt_idx]
        };

        let q_min = if node.axis == 0 { min_lat } else { min_lon };
        let q_max = if node.axis == 0 { max_lat } else { max_lon };

        if q_min <= split_val {
            self.query_recursive(
                node.left,
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

        if q_max >= split_val {
            self.query_recursive(
                node.right,
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
