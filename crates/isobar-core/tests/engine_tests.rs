use isobar_core::math::{haversine_distance_km, bounding_box_from_radius};
use isobar_core::ring_buffer::ColumnarRingBuffer;
use isobar_core::kdtree::SpatialTemporalKDTree;
use isobar_core::rtree::SpatialTemporalRTree;
use isobar_core::query::QueryEngine;

#[test]
fn test_ring_buffer_wrapping() {
    let mut ring = ColumnarRingBuffer::new(5);
    for i in 0..8 {
        ring.push(
            1000.0 + i as f64,
            40.0 + i as f64 * 0.1,
            -74.0 + i as f64 * 0.1,
            10000.0,
            1013.25,
            250.0,
            90.0,
            i as u32,
        );
    }

    assert_eq!(ring.count, 5);
    assert_eq!(ring.head, 3); // 8 % 5 = 3
    // Oldest surviving record should be i=3
    let (t, _, _, _, _, _, _, entity_id) = ring.get(3);
    assert_eq!(entity_id, 3);
    assert_eq!(t, 1003.0);
}

#[test]
fn test_haversine_accuracy() {
    // Distance between London (51.5074, -0.1278) and Paris (48.8566, 2.3522) ~ 343 km
    let dist = haversine_distance_km(51.5074, -0.1278, 48.8566, 2.3522);
    assert!((dist - 343.5).abs() < 5.0, "London to Paris distance was {}", dist);
}

#[test]
fn test_kdtree_spatial_range_against_naive() {
    let mut ring = ColumnarRingBuffer::new(1000);
    // Ingest simulated flights around JFK airport (40.6413, -73.7781)
    let center_lat = 40.6413;
    let center_lon = -73.7781;

    for i in 0..500 {
        let lat = center_lat + ((i as f64 % 20.0) - 10.0) * 0.05;
        let lon = center_lon + (((i * 7) as f64 % 20.0) - 10.0) * 0.05;
        let time = 10000.0 + (i as f64 * 100.0);
        ring.push(time, lat, lon, 3000.0, 1010.0, 180.0, 45.0, i as u32);
    }

    let mut kdtree = SpatialTemporalKDTree::new(1000);
    kdtree.rebuild(&ring);

    let mut qe = QueryEngine::new(500);

    // Query 50 km radius in last 20 seconds
    let radius_km = 50.0;
    let start_time = 15000.0;
    let end_time = 35000.0;

    let kd_count = qe.query_radius(center_lat, center_lon, radius_km, start_time, end_time, &kdtree, &ring);
    let naive_count = qe.naive_scan_radius(center_lat, center_lon, radius_km, start_time, end_time, &ring);

    assert_eq!(kd_count, naive_count, "KDTree and Naive scan match count must be equal");
    assert!(kd_count > 0, "Query should match non-zero points");
}

#[test]
fn test_rtree_against_naive() {
    let mut ring = ColumnarRingBuffer::new(500);
    let center_lat = 37.7749;
    let center_lon = -122.4194;

    for i in 0..200 {
        let lat = center_lat + ((i as f64 % 15.0) - 7.0) * 0.04;
        let lon = center_lon + (((i * 5) as f64 % 15.0) - 7.0) * 0.04;
        let time = 5000.0 + (i as f64 * 50.0);
        ring.push(time, lat, lon, 4500.0, 1015.0, 210.0, 120.0, i as u32);
    }

    let mut rtree = SpatialTemporalRTree::new(500);
    rtree.rebuild(&ring);

    let (min_lat, min_lon, max_lat, max_lon) = bounding_box_from_radius(center_lat, center_lon, 30.0);
    let mut out = vec![0u32; 500];
    let rtree_count = rtree.query_range(min_lat, min_lon, max_lat, max_lon, 6000.0, 12000.0, center_lat, center_lon, 30.0, &ring, &mut out);

    let mut qe = QueryEngine::new(500);
    let naive_count = qe.naive_scan_radius(center_lat, center_lon, 30.0, 6000.0, 12000.0, &ring);

    assert_eq!(rtree_count, naive_count);
}
