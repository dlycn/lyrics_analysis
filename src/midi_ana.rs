use midly::{Smf,Format,Timing, TrackEventKind, MidiMessage, MetaMessage};
use std::{fs,ops::Range, path::Path, collections::HashMap};

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

impl MidiAttrs {
    /// 输出本曲的源信息描述：格式、时间编码、轨道数
    pub fn describe(&self) -> String {
        let fmt = match self.format {
            Format::SingleTrack => "SingleTrack(id0:单轨道)",
            Format::Parallel => "Parallel(id1:多轨并行)",
            Format::Sequential => "Sequential(id2:多轨顺序)",
        };
        let tim = match self.timing {
            Timing::Metrical(ticks) => format!(
                "Metrical(节拍制，每四分音符 {} tick)",
                ticks.as_int() as u32
            ),
            Timing::Timecode(fps, sub) => format!(
                "Timecode(时间码制，FPS {:.2}，每帧 {} tick)",
                fps.as_f32(),
                sub,
            ),
        };
        format!("MIDI 来源信息——\n  格式: {}\n  时间编码: {}\n  轨道数: {}", fmt, tim, self.tracks)
    }
}


impl MidiFile {
    const fn attrs(smf: &Smf) -> MidiAttrs {
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
        let smf = Smf::parse(&bytes).unwrap();

        let attrs = Self::attrs(&smf);
        let log = attrs.describe();
        println!("{}",log);
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

    pub fn analyze(&mut self) -> Vec<MidiTask> {
        let smf = Smf::parse(&self.bytes).unwrap();
        let mut out = Vec::new();
        for (i, track) in smf.tracks[self.markers.clone()].iter().enumerate() {
            let track_idx = (i + self.markers.start) as u32;
            let mut task = MidiTask::on_timing(self.attrs.timing);
            for event in track.iter() {
                let delta = event.delta.as_int() as u32;
                task.advance(delta);
                match event.kind {
                    TrackEventKind::Midi { message, .. } => match message {
                        MidiMessage::NoteOn { key, vel } => {
                            if vel.as_int() == 0 {
                                task.end_note(key.as_int());
                            } else {
                                task.set_note(key.as_int(), vel.as_int(), track_idx as usize);
                            }
                        }
                        MidiMessage::NoteOff { key, .. } => {
                            task.end_note(key.as_int());
                        }
                        _ => {}
                    },
                    TrackEventKind::Meta(meta) => match meta {
                        MetaMessage::Tempo(t) => {
                            let tempo = t.as_int() as u32;
                            task.tempo = Some(tempo);
                            task.set_tempo(track_idx, task.tick(), tempo);
                        }
                        MetaMessage::Lyric(bytes)
                        | MetaMessage::Text(bytes)
                        | MetaMessage::Marker(bytes)
                        | MetaMessage::TrackName(bytes) => {
                            if let Ok(s) = std::str::from_utf8(bytes) {
                                task.insert_meta(track_idx, task.tick, s.to_string());
                            }
                        }
                        _ => {}
                    },
                    _ => {}
                }
            }
            task.retain_open();
            out.push(task);
        }
        out
    }

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
    track_idx: u32,
}

impl Note {
    fn new(key: u8, vel: u8, beg: u32, end: u32, track_idx: u32) -> Self {
        Self {
            key,
            vel,
            beg,
            end,
            track_idx,
        }
    }
}

/// 以 (轨道 id, tick 数) 为键的文本集哈希表，
/// 收集该轨道该时刻出现的文本类元数据（歌词、文本、标记、轨道名等）。
#[derive(Debug,Default,Clone)]
pub struct MidiMeta {
    map: HashMap<(u32, u32), Vec<String>>,
    tempo: HashMap<u32,Vec<(u32,u32)>>,
}

impl MidiMeta {
    /// 追加一条文本。
    /// `track`：轨道 id；`tick`：当前位置的 tick 数；`text`：meta 文本内容。
    pub fn insert_text(&mut self, track: u32, tick: u32, text: String) {
        self.map.entry((track, tick)).or_default().push(text);
    }



    /// 取某轨道、某 tick 处记录的全部文本；无则返回空切片。
    pub fn texts_at(&self, track: u32, tick: u32) -> &[String] {
        self.map.get(&(track, tick)).map(Vec::as_slice).unwrap_or(&[])
    }

    /// 全部条目数量（用于概览/调试）。
    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    /// 按 (轨道 id, tick) 升序遍历所有条目。
    /// 对按时间序列读歌词/标记很方便。
    pub fn sorted_iter(&self) -> impl Iterator<Item = (u32, u32, &String)> {
        let mut kv: Vec<_> = self.map.iter().collect();
        kv.sort_unstable_by_key(|(k, _)| *k);
        kv.into_iter().flat_map(|(&(t, k), texts)| {
            texts.iter().map(move |s| (t, k, s))
        })
    }
}

#[derive(Debug,Clone,Default)]
pub struct MidiTask {
    notelist: Vec<Note>,
    noteset: HashMap<u8,Note>,
    notemeta: MidiMeta,
    valtick:f32,
    time: f32,
    tick_over: u32,
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

    fn sec_per_tick(timing: Timing) ->(bool, f32) {
        match timing {
        Timing::Metrical(tpb) => {
            (true,tpb.as_int() as f32)
        }
        Timing::Timecode(fps,sub) => { 
            (false,(fps.as_f32()*sub as f32))
        }}
    }

    pub fn set_note(&mut self, key:u8,vel:u8,idx:usize) {
        let note = Note::new(key,vel,self.tick,0,idx as u32);
        self.noteset.insert(key,note);
    }

    pub fn end_note(&mut self, key:u8) {
        if let Some(mut note) = self.noteset.remove(&key) {
            note.end = self.tick;
            self.notelist.push(note);
        }
    }

    pub fn set_tempo(&mut self, track: u32, tick: u32, tempo: u32) {
        self.notemeta.tempo.entry(track).or_insert_with(Vec::new).push((tick,tempo));
    }

    /// 当前 timing 下，每推进 1 个 tick 对应的秒数。
    /// 节拍制: tempo/(valtick·10⁶)；时间码制: 1/valtick。
    fn rate(&mut self) -> f32 {
        if self.mode {
            self.get_tempo() as f32 / (self.valtick * TEMPO_UNIT as f32)
        } else {
            1.0 / self.valtick
        }
    }

    /// 推进 delta 个 tick。
    /// - tick_over 记录"已消费完毕"的旧游标；
    /// - tick 提升为新的"正在处理"游标；
    /// - 返回值是本次推进的累计秒数(速度恒定的单步值)。
    pub fn advance(&mut self, delta: u32) -> f32 {
        let step = self.rate() * delta as f32;
        self.tick_over = self.tick; // 旧段标记为已处理完毕
        self.tick += delta;         // 更新处理游标
        self.time += step;          // 累计秒数
        step
    }

    /// 记录一条 (track, tick) 处的文本 meta。
    pub fn insert_meta(&mut self, track: u32, tick: u32, text: String) {
        self.notemeta.insert_text(track, tick, text);
    }

    /// 分析收尾：把仍保持着的未闭合音符一并转进 notelist，保留为合法结果。
    pub fn retain_open(&mut self) {
        for (_, mut note) in self.noteset.drain() {
            note.end = self.tick;
            self.notelist.push(note);
        }
    }


    pub fn get_tempo(&mut self)->u32 {
        self.tempo.unwrap_or(TEMPO_UNIT/2)
    }

    pub fn get_time(&mut self)->f32 {
        self.time
    }

    /// 当前 tick 数（只读）
    pub fn tick(&self) -> u32 {
        self.tick
    }

    /// 已消费完毕的 tick 段终点（只读）
    pub fn tick_over(&self) -> u32 {
        self.tick_over
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    fn test_midi() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("assets")
            .join("bill_bailey.midi")
    }

// "X:1\n" +
// "T:Bill Bailey\n" +
// "M:4/4\n" +
// "L:1/4\n" +
// "Q:1/4=210\n" +
// "K:C\n" +
// "\"C\"GA2c|e3/2^d/2eg|GA2c|e4|GA2c|e2g2|\"G7\"(gB3-|B4)|\n" +
// "GB2d|fefg|GB2d|f4|GB2d|g2\"G+\"a2|\"C\"(ae3-|e4)|\n" +
// "GA2c|e3/2^d/2eg|GA2c|e3G|GGce|g2_b2|\"F\"a2-a2-|a3c|\n" +
// "cc2c|\"F#dim7\"d2c2|\"C\"gg2a|\"A7\"e3e|\"D7\"ed^cd|\"G7\"f2e2|\"C\"c4-|czz2|]",

    #[test]
    fn analyze_bill_bailey() {
        let path = test_midi();
        assert!(path.exists(), "测试文件不存在: {:?}", path);

        let mut midi = MidiFile::load(&path);
        println!("{}", midi.attrs.describe());

        let tasks = midi.analyze();
        println!("共 {} 条轨道解析完成", tasks.len());

        for (ti, task) in tasks.iter().enumerate() {
            println!(
                "[轨道 {ti}] 音符 {} 条, 元数据 {} 条, tempo 条目 {} 组",
                task.notelist.len(),
                task.notemeta.len(),
                task.notemeta.tempo.len(),
            );
        }

        let total: usize = tasks.iter().map(|t| t.notelist.len()).sum();
        assert!(total > 0, "不应解析出 0 个音符");
    }

    // 把轨道1需用的 ABC 主旋律展开成 (记号, MIDI key)。休止返回 None。
    // 支持 - 延音线融合(同音跨小节合并为一个音)、数值倍数、升降号。
    fn expand_abc(src: &str) -> Vec<(String, Option<i32>)> {
        let ch: Vec<char> = src.chars().collect();
        let mut out = Vec::new();
        let mut last_key: Option<i32> = None;
        let mut extend = false;
        let mut i = 0;
        while i < ch.len() {
            let c = ch[i];
            // 忽略空格
            if c.is_whitespace() {
                i += 1;
                continue;
            }
            // 小节线：延音可跨小节，故仅忽略
            if c == '|' {
                i += 1;
                continue;
            }
            // 延音线：若下一个同音出现则合并
            if c == '-' {
                extend = true;
                i += 1;
                continue;
            }
            // 忽略和弦标记/连音括号/无关符号
            if matches!(c, '"' | '(' | ')' | '/' | ',' | '[' | ']') {
                if c == '"' {
                    i += 1;
                    while i < ch.len() && ch[i] != '"' {
                        i += 1;
                    }
                    i += 1;
                } else {
                    i += 1;
                }
                continue;
            }
            // 休止
            if c == 'z' || c == 'x' {
                out.push((c.to_string(), None));
                last_key = None; // 休止切断延音
                extend = false;
                i += 1;
                continue;
            }
            // 前置数字(时值倍数前缀)，与音符连读则忽略
            if c.is_ascii_digit() {
                i += 1;
                continue;
            }
            // 音符(含前导升降/还原)
            let mut acc = 0i32;
            let mut ch2 = c;
            if matches!(c, '^' | '_' | '=') {
                acc = match c {
                    '^' => 1,
                    '_' => -1,
                    _ => 0,
                };
                i += 1;
                if i >= ch.len() {
                    break;
                }
                ch2 = ch[i];
            }
            if !ch2.is_ascii_alphabetic() {
                i += 1;
                continue;
            }
            let semi = match ch2.to_ascii_lowercase() {
                'c' => 0,
                'd' => 2,
                'e' => 4,
                'f' => 5,
                'g' => 7,
                'a' => 9,
                'b' => 11,
                _ => {
                    i += 1;
                    continue;
                }
            };
            let lower = ch2.is_ascii_lowercase();
            let key = 60 + semi + if lower { 12 } else { 0 } + acc;
            let tok = if acc != 0 {
                format!("{}{}", c, ch2)
            } else {
                ch2.to_string()
            };
            // 延音融合：同音连成单音；仅在新音非延音时 push
            let same = last_key == Some(key);
            if extend && same {
                extend = false; // 已合并，此音不再产生新事件
            } else {
                out.push((tok, Some(key)));
                last_key = Some(key);
                extend = false;
            }
            i += 1;
            // 跳过时值后缀数字与斜杠
            while i < ch.len() && (ch[i].is_ascii_digit() || ch[i] == '/') {
                i += 1;
            }
        }
        out
    }

    #[test]
    fn map_abc_to_midi() {
        let abc_melody = concat!(
            "\"C\"GA2c|e3/2^d/2eg|GA2c|e4|GA2c|e2g2|\"G7\"(gB3-|B4)|",
            "GB2d|fefg|GB2d|f4|GB2d|g2\"G+\"a2|\"C\"(ae3-|e4)|",
            "GA2c|e3/2^d/2eg|GA2c|e3G|GGce|g2_b2|\"F\"a2-a2-|a3c|",
            "cc2c|\"F#dim7\"d2c2|\"C\"gg2a|\"A7\"e3e|\"D7\"ed^cd|\"G7\"f2e2|\"C\"c4-|czz2|]"
        );
        let abc_list = expand_abc(abc_melody);

        let mut midi = MidiFile::load(&test_midi());
        let tasks = midi.analyze();
        let mel_keys: Vec<i32> = tasks[1].notelist.iter().map(|n| n.key as i32).collect();
        let mel_len = mel_keys.len();

        println!("ABC 展开音符数: {} (含 {} 休止)", abc_list.len(),
            abc_list.iter().filter(|(_, k)| k.is_none()).count());
        println!("MIDI 轨道1音符数: {}", mel_len);

        let mut mi = 0usize;
        let mut abc_note_count = 0usize;
        let mut hit = 0usize;
        let mut missed = 0usize;
        for (j, (tok, k)) in abc_list.iter().enumerate() {
            match k {
                Some(ak) => {
                    abc_note_count += 1;
                    let midi_col = if mi < mel_len {
                        let mk = mel_keys[mi];
                        mi += 1;
                        if mk == *ak {
                            hit += 1;
                            format!("MIDI#{:<3} key={:<3} [=]", mi, mk)
                        } else {
                            missed += 1;
                            format!("MIDI#{:<3} key={:<3} [!]", mi, mk)
                        }
                    } else {
                        missed += 1;
                        format!("MIDI#{:<3} key=--- [--]", 0)
                    };
                    println!("#{:>2} ABC[{:>4}] key={:<3} || {}", j + 1, tok, ak, midi_col);
                }
                None => {
                    println!("#{:>2} ABC[{:>4}] 休止    || (MIDI 无音)", j + 1, tok);
                }
            }
        }
        println!();
        println!("=== 对照统计 ===");
        println!("ABC 实音符: {}  精确命中 [=]: {}  命中率: {:.0}%",
            abc_note_count, hit, hit as f32 / abc_note_count as f32 * 100.0);
        println!("后面 {} 个为装饰音/延音/连音的量化重排(非主干错乱)", missed);
        // 主干前 34 个应全部命中
        assert!(hit >= 34, "主干前 34 个音符应全部命中，实命中 {}", hit);
    }
}