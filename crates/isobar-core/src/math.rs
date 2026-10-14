//! Mathematical foundations for Isobar: Geodesic and Barometric Telemetry Computations

pub const EARTH_RADIUS_KM: f64 = 6371.0088;
pub const PI: f64 = core::f64::consts::PI;
pub const DEG_TO_RAD: f64 = PI / 180.0;
pub const RAD_TO_DEG: f64 = 180.0 / PI;

/// Atmospheric standard sea-level pressure in hectopascals (hPa / mbar)
pub const STANDARD_SEA_LEVEL_PRESSURE_HPA: f64 = 1013.25;

/// Computes the exact geodesic distance between two latitude/longitude points in kilometers using the Haversine formula.
#[inline(always)]
pub fn haversine_distance_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let d_lat = (lat2 - lat1) * DEG_TO_RAD;
    let d_lon = (lon2 - lon1) * DEG_TO_RAD;

    let lat1_rad = lat1 * DEG_TO_RAD;
    let lat2_rad = lat2 * DEG_TO_RAD;

    let sin_d_lat_2 = (d_lat * 0.5).sin();
    let sin_d_lon_2 = (d_lon * 0.5).sin();

    let a = sin_d_lat_2 * sin_d_lat_2 + lat1_rad.cos() * lat2_rad.cos() * sin_d_lon_2 * sin_d_lon_2;
    let c = 2.0 * a.sqrt().atan2((1.0 - a).max(0.0).sqrt());

    EARTH_RADIUS_KM * c
}

/// Ultra-fast equirectangular approximation for distances over regional bounds (< 1500 km).
/// Used as a zero-trig branch-and-bound screening filter before exact Haversine verification.
#[inline(always)]
pub fn equirectangular_distance_sq_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let mean_lat_rad = ((lat1 + lat2) * 0.5) * DEG_TO_RAD;
    let cos_lat = mean_lat_rad.cos();
    let x = (lon2 - lon1) * DEG_TO_RAD * cos_lat;
    let y = (lat2 - lat1) * DEG_TO_RAD;
    (x * x + y * y) * (EARTH_RADIUS_KM * EARTH_RADIUS_KM)
}

/// Computes a geographic bounding box [min_lat, min_lon, max_lat, max_lon] covering a given radius in km.
#[inline(always)]
pub fn bounding_box_from_radius(center_lat: f64, center_lon: f64, radius_km: f64) -> (f64, f64, f64, f64) {
    let delta_lat = (radius_km / EARTH_RADIUS_KM) * RAD_TO_DEG;
    let min_lat = (center_lat - delta_lat).max(-90.0);
    let max_lat = (center_lat + delta_lat).min(90.0);

    let cos_lat = (center_lat * DEG_TO_RAD).abs().cos();
    let delta_lon = if cos_lat > 1e-6 {
        (radius_km / (EARTH_RADIUS_KM * cos_lat)) * RAD_TO_DEG
    } else {
        180.0
    };

    let min_lon = (center_lon - delta_lon).max(-180.0);
    let max_lon = (center_lon + delta_lon).min(180.0);

    (min_lat, min_lon, max_lat, max_lon)
}

/// Converts barometric pressure (hPa) to pressure altitude in meters according to the International Standard Atmosphere (ISA).
#[inline(always)]
pub fn pressure_to_altitude_meters(pressure_hpa: f64) -> f64 {
    if pressure_hpa <= 0.0 {
        return 0.0;
    }
    44330.0 * (1.0 - (pressure_hpa / STANDARD_SEA_LEVEL_PRESSURE_HPA).powf(1.0 / 5.255))
}

/// Converts geometric altitude in meters to ISA expected barometric pressure in hPa.
#[inline(always)]
pub fn altitude_to_pressure_hpa(altitude_m: f64) -> f64 {
    STANDARD_SEA_LEVEL_PRESSURE_HPA * (1.0 - altitude_m / 44330.0).max(0.0).powf(5.255)
}
