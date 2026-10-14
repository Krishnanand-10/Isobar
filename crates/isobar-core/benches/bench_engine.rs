//! Benchmarks for Isobar: Columnar Ring Buffer ingestion and KD-Tree range queries

use isobar_core::ring_buffer::ColumnarRingBuffer;
use isobar_core::kdtree::SpatialTemporalKDTree;
use isobar_core::query::QueryEngine;

fn main() {
    println!("=== Isobar Microsecond Performance Benchmark ===");

    let capacity = 100_000;
    let mut ring = ColumnarRingBuffer::new(capacity);

    // 1. Benchmark Ingestion
    let start = std::time::Instant::now();
    for i in 0..capacity {
        let lat = 40.0 + ((i % 100) as f64 * 0.05);
        let lon = -74.0 + (((i * 3) % 100) as f64 * 0.05);
        let time = 1_000_000.0 + (i as f64 * 10.0);
        ring.push(time, lat, lon, 10_000.0, 1013.25, 450.0, 90.0, i as u32);
    }
    let ingest_duration = start.elapsed();
    let throughput = capacity as f64 / ingest_duration.as_secs_f64();
    println!(
        "Ingestion: {} points in {:?} ({:.0} points/sec)",
        capacity, ingest_duration, throughput
    );

    // 2. Benchmark Index Rebuild
    let start_rebuild = std::time::Instant::now();
    let mut kdtree = SpatialTemporalKDTree::new(capacity);
    kdtree.rebuild(&ring);
    let rebuild_duration = start_rebuild.elapsed();
    println!(
        "KD-Tree Rebuild ({} points): {:?}",
        capacity, rebuild_duration
    );

    // 3. Benchmark Spatial Range Query (100km radius, last 60s)
    let mut qe = QueryEngine::new(10_000);
    let center_lat = 40.5;
    let center_lon = -73.5;
    let radius_km = 100.0;
    let query_start_time = 1_900_000.0;
    let query_end_time = 2_000_000.0;

    let start_query = std::time::Instant::now();
    let matches = qe.query_radius(
        center_lat,
        center_lon,
        radius_km,
        query_start_time,
        query_end_time,
        &kdtree,
        &ring,
    );
    let query_duration = start_query.elapsed();
    println!(
        "KD-Tree Query: {} matches in {:?} ({:.3} ms)",
        matches,
        query_duration,
        query_duration.as_secs_f64() * 1000.0
    );

    // 4. Naive Full Scan Comparison
    let start_naive = std::time::Instant::now();
    let naive_matches = qe.naive_scan_radius(
        center_lat,
        center_lon,
        radius_km,
        query_start_time,
        query_end_time,
        &ring,
    );
    let naive_duration = start_naive.elapsed();
    println!(
        "Naive Full Scan: {} matches in {:?} ({:.3} ms)",
        naive_matches,
        naive_duration,
        naive_duration.as_secs_f64() * 1000.0
    );

    let speedup = naive_duration.as_secs_f64() / query_duration.as_secs_f64();
    println!("Execution Speedup Multiplier: {:.1}x faster", speedup);
}
