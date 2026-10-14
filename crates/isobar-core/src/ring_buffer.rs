//! Flat Columnar Storage Circular Ring Buffer
//! Allocates fixed-capacity continuous buffers at initialization to guarantee zero heap churn and zero GC pauses.

pub struct ColumnarRingBuffer {
    pub capacity: usize,
    pub head: usize,
    pub count: usize,
    pub timestamps: Vec<f64>,
    pub latitudes: Vec<f64>,
    pub longitudes: Vec<f64>,
    pub altitudes: Vec<f64>,
    pub pressures: Vec<f64>,
    pub velocities: Vec<f64>,
    pub headings: Vec<f32>,
    pub entity_ids: Vec<u32>,
}

impl ColumnarRingBuffer {
    pub fn new(capacity: usize) -> Self {
        let cap = capacity.max(1);
        Self {
            capacity: cap,
            head: 0,
            count: 0,
            timestamps: vec![0.0; cap],
            latitudes: vec![0.0; cap],
            longitudes: vec![0.0; cap],
            altitudes: vec![0.0; cap],
            pressures: vec![0.0; cap],
            velocities: vec![0.0; cap],
            headings: vec![0.0; cap],
            entity_ids: vec![0; cap],
        }
    }

    #[inline(always)]
    pub fn push(
        &mut self,
        timestamp: f64,
        lat: f64,
        lon: f64,
        alt: f64,
        pressure: f64,
        velocity: f64,
        heading: f32,
        entity_id: u32,
    ) -> usize {
        let idx = self.head;
        self.timestamps[idx] = timestamp;
        self.latitudes[idx] = lat;
        self.longitudes[idx] = lon;
        self.altitudes[idx] = alt;
        self.pressures[idx] = pressure;
        self.velocities[idx] = velocity;
        self.headings[idx] = heading;
        self.entity_ids[idx] = entity_id;

        self.head = (self.head + 1) % self.capacity;
        if self.count < self.capacity {
            self.count += 1;
        }
        idx
    }

    #[inline(always)]
    pub fn is_empty(&self) -> bool {
        self.count == 0
    }

    #[inline(always)]
    pub fn len(&self) -> usize {
        self.count
    }

    #[inline(always)]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    #[inline(always)]
    pub fn clear(&mut self) {
        self.head = 0;
        self.count = 0;
    }

    #[inline(always)]
    pub fn get(&self, idx: usize) -> (f64, f64, f64, f64, f64, f64, f32, u32) {
        (
            self.timestamps[idx],
            self.latitudes[idx],
            self.longitudes[idx],
            self.altitudes[idx],
            self.pressures[idx],
            self.velocities[idx],
            self.headings[idx],
            self.entity_ids[idx],
        )
    }
}
