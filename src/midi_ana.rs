use midly::{Smf,Format,Timing};
use std::{fs, path::Path, ops::Range};

const TEMPO_UNIT:u32=1_000_000;

pub struct MidiFile {
    bytes: Vec<u8>,
    attrs: MidiAttrs,
    markers: Range<usize>,
}

pub struct MidiAttrs {
    pub format: Format,
    pub timing: Timing,
    pub tracks: usize,
}


impl MidiFile {
    fn attrs(bytes: &[u8]) -> MidiAttrs {
        let smf = Smf::parse(bytes).unwrap();
        MidiAttrs {
            format: smf.header.format,
            timing: smf.header.timing,
            tracks: smf.tracks.len(),
        }
    }
    fn set_window(&mut self, range:[usize;2])->&mut Self {
        self.set_beg(range[0]).set_end(range[1])
    }
    pub fn load(path: &Path) -> Self {
        let bytes = fs::read(path).unwrap();
        let attrs = Self::attrs(&bytes);
        let markers = 0..attrs.tracks;
        Self {
            bytes,
            attrs,
            markers,
        }
    }

    pub fn set_beg(&mut self, id:usize)->&mut Self {
        self.markers.start = id.clamp(0, self.attrs.tracks);
        self
    }
    pub fn set_end(&mut self, id:usize)->&mut Self {
        self.markers.end = id.clamp(0, self.attrs.tracks);
        self
    }


    pub fn analyze_with_window(&mut self, range:[usize;2]) {
        self.set_window(range).analyze();
    }

    pub fn analyze(&mut self) {
        let smf = Smf::parse(&self.bytes).unwrap();
        let mut task = MidiTask::on_timing(self.attrs.timing);
        for (track_idx, track) in smf.tracks[self.markers.clone()].iter().enumerate() {
            }}

    pub fn load_midi(path: &Path) -> MidiFile {
    MidiFile::load(path)
}
}


#[derive(Debug,Clone)]
struct Note {
    pub key: u8,
    pub vel: u8,
    pub beg: u32,
    pub end: u32,
    pub tempo: u32,
}

#[derive(Debug,Clone,Default)]
pub struct MidiTask {
    notelist: Vec<Note>,
    valtick:u32,
    time: f32,
    tick: u32,
    mode:bool,
    pub tempo: Option<u32>,
}

impl MidiTask {
    pub fn on_timing(timing: Timing) -> Self {
        let (mode,valtick) = Self::sec_per_tick(timing);
        Self {
            mode,
            valtick,
            ..Self::default()
        }
    }

    fn sec_per_tick(timing: Timing) ->(bool, u32) {
        match timing {
        Timing::Metrical(tpb) => {
            (true,tpb.as_int() as u32)
        }
        Timing::Timecode(fps,sub) => { 
            (false,(fps.as_f32()*sub as f32) as u32)
        }}
    }

    pub fn get_tempo(&mut self)->u32 {
        self.tempo.unwrap_or(TEMPO_UNIT/2)
    }

    pub fn get_time(&mut self)->f32 {
        self.time
    }

    pub fn update_time(&mut self) -> f32 {
        let m = self.mode as u32;
        let n = !self.mode as u32;
        let numerator = (n+m * self.get_tempo()-1) as f32; // tempo 或 1
        let unifyval = (self.valtick*(n+TEMPO_UNIT*m)) as f32;
        let delta_time = numerator / unifyval;
        self.time += delta_time;
        delta_time
    }

}
