/**
 * midi-utils.js — MIDI 轻量解析/生成工具
 *
 * 纯 JS 实现，不依赖外部库。
 * 支持: 解析 SMF (Standard MIDI File), 提取 note events, tempo map, 量化。
 */

const MIDIUtils = (() => {

    /** MIDI 事件类型 */
    const EVENT = {
        NOTE_OFF: 0x80,
        NOTE_ON: 0x90,
        POLY_PRESSURE: 0xA0,
        CONTROL_CHANGE: 0xB0,
        PROGRAM_CHANGE: 0xC0,
        CHANNEL_PRESSURE: 0xD0,
        PITCH_BEND: 0xE0,
        META: 0xFF
    };

    const META_TYPE = {
        SEQUENCE_NUMBER: 0x00,
        TEXT: 0x01,
        COPYRIGHT: 0x02,
        TRACK_NAME: 0x03,
        INSTRUMENT: 0x04,
        LYRIC: 0x05,
        MARKER: 0x06,
        CUE_POINT: 0x07,
        CHANNEL_PREFIX: 0x20,
        END_OF_TRACK: 0x2F,
        SET_TEMPO: 0x51,
        SMPTE_OFFSET: 0x54,
        TIME_SIGNATURE: 0x58,
        KEY_SIGNATURE: 0x59
    };

    /**
     * 读取变长整数（Variable Length Quantity）
     * @returns {{ value: number, bytesRead: number }}
     */
    function readVLQ(bytes, offset) {
        let value = 0;
        let bytesRead = 0;
        let b;
        do {
            b = bytes[offset + bytesRead];
            value = (value << 7) | (b & 0x7F);
            bytesRead++;
        } while (b & 0x80 && bytesRead < 4);
        return { value, bytesRead };
    }

    /**
     * 写入变长整数
     */
    function writeVLQ(value) {
        const bytes = [];
        const buffer = value & 0x7F;
        value >>= 7;
        while (value > 0) {
            bytes.unshift((value & 0x7F) | 0x80);
            value >>= 7;
        }
        bytes.push(buffer);
        return new Uint8Array(bytes);
    }

    /**
     * 解析 MIDI 文件头部
     */
    function parseHeader(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const chunkType = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
        if (chunkType !== 'MThd') {
            throw new Error('Not a valid MIDI file: missing MThd chunk');
        }
        const length = view.getUint32(4);
        const format = view.getUint16(8);
        const numTracks = view.getUint16(10);
        const division = view.getUint16(12);

        const isTimeBased = !(division & 0x8000);
        const ticksPerBeat = isTimeBased ? division : 0;
        const fps = isTimeBased ? 0 : ((division >> 8) & 0x7F);
        const ticksPerFrame = isTimeBased ? 0 : (division & 0xFF);

        return {
            format,
            numTracks,
            division,
            ticksPerBeat,
            fps,
            ticksPerFrame,
            headerSize: 8 + length
        };
    }

    /**
     * 解析单个 MIDI track
     * @returns {{ events: Array, tempoMap: Array, endOffset: number }}
     */
    function parseTrack(bytes, offset, ticksPerBeat) {
        const events = [];
        const tempoMap = [];
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        const chunkType = String.fromCharCode(
            view.getUint8(offset), view.getUint8(offset + 1),
            view.getUint8(offset + 2), view.getUint8(offset + 3)
        );
        if (chunkType !== 'MTrk') {
            throw new Error(`Expected MTrk chunk at offset ${offset}, got ${chunkType}`);
        }
        const trackLength = view.getUint32(offset + 4);
        let pos = offset + 8;
        const endPos = pos + trackLength;
        let runningStatus = 0;
        let absoluteTime = 0;

        while (pos < endPos) {
            const { value: delta, bytesRead: vlqLen } = readVLQ(bytes, pos);
            pos += vlqLen;
            absoluteTime += delta;

            let status = bytes[pos];
            if (status < 0x80) {
                status = runningStatus;
            } else {
                runningStatus = status;
                pos++;
            }

            if (status === EVENT.META) {
                const metaType = bytes[pos++];
                const { value: metaLen, bytesRead: metaVlqLen } = readVLQ(bytes, pos);
                pos += metaVlqLen;
                const metaData = bytes.slice(pos, pos + metaLen);

                if (metaType === META_TYPE.SET_TEMPO) {
                    const tempo = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
                    const bpm = Math.round(60000000 / tempo);
                    tempoMap.push({ tick: absoluteTime, bpm, tempo });
                }

                events.push({
                    type: 'meta',
                    subType: metaType,
                    delta,
                    absoluteTime,
                    data: metaData,
                    tick: absoluteTime
                });
                pos += metaLen;
            } else if (status === 0xF0 || status === 0xF7) {
                const { value: sysexLen, bytesRead: sxVlqLen } = readVLQ(bytes, pos);
                pos += sxVlqLen;
                events.push({
                    type: 'sysex',
                    delta,
                    absoluteTime,
                    data: bytes.slice(pos, pos + sysexLen),
                    tick: absoluteTime
                });
                pos += sysexLen;
            } else {
                const channel = status & 0x0F;
                const eventType = status & 0xF0;
                const note = bytes[pos++];
                const velocity = bytes[pos++] || 0;

                const event = {
                    type: 'midi',
                    eventType,
                    channel,
                    delta,
                    absoluteTime,
                    tick: absoluteTime
                };

                if (eventType === EVENT.NOTE_ON || eventType === EVENT.NOTE_OFF) {
                    event.note = note;
                    event.velocity = velocity;
                    event.isNoteOn = eventType === EVENT.NOTE_ON && velocity > 0;
                } else if (eventType === EVENT.CONTROL_CHANGE) {
                    event.controller = note;
                    event.value = velocity;
                }

                events.push(event);
            }
        }

        return { events, tempoMap, endOffset: endPos };
    }

    /**
     * 从事件列表提取 note 序列
     * @returns {Array<{note: number, velocity: number, startTick: number, endTick: number, duration: number, channel: number}>}
     */
    function extractNotes(events) {
        const notes = [];
        const pending = {};

        for (const ev of events) {
            if (ev.type !== 'midi') continue;

            if (ev.eventType === EVENT.NOTE_ON && ev.velocity > 0) {
                const key = `${ev.channel}_${ev.note}`;
                pending[key] = {
                    note: ev.note,
                    velocity: ev.velocity,
                    startTick: ev.tick,
                    channel: ev.channel
                };
            } else if (
                (ev.eventType === EVENT.NOTE_OFF) ||
                (ev.eventType === EVENT.NOTE_ON && ev.velocity === 0)
            ) {
                const key = `${ev.channel}_${ev.note}`;
                if (pending[key]) {
                    const n = pending[key];
                    n.endTick = ev.tick;
                    n.duration = ev.tick - n.startTick;
                    notes.push(n);
                    delete pending[key];
                }
            }
        }
        return notes;
    }

    /**
     * 构建 tempo map，将 tick 转为秒
     * @param {number} ticksPerBeat - 每拍的 tick 数
     * @returns {Array<{tick: number, secondsPerTick: number}>}
     */
    function buildTempoMap(ticksPerBeat, tempoEvents) {
        if (tempoEvents.length === 0) {
            const defaultBpm = 120;
            const usPerBeat = 60000000 / defaultBpm;
            return [{ tick: 0, secondsPerTick: usPerBeat / (ticksPerBeat * 1000000) }];
        }
        const sorted = [...tempoEvents].sort((a, b) => a.tick - b.tick);
        return sorted.map(t => ({
            tick: t.tick,
            secondsPerTick: t.tempo / (ticksPerBeat * 1000000)
        }));
    }

    /**
     * tick → 秒
     */
    function tickToSeconds(tick, tempoMap) {
        let seconds = 0;
        let prevTick = 0;
        let currentTempo = tempoMap[0];

        for (let i = 0; i < tempoMap.length; i++) {
            const t = tempoMap[i];
            if (t.tick > tick) break;
            seconds += (t.tick - prevTick) * currentTempo.secondsPerTick;
            prevTick = t.tick;
            currentTempo = t;
        }
        seconds += (tick - prevTick) * currentTempo.secondsPerTick;
        return seconds;
    }

    /**
     * 构建最简单的 MIDI 文件（单轨）
     * @param {Array<{note: number, startTick: number, duration: number, velocity?: number, channel?: number}>} noteList
     * @param {{ticksPerBeat?: number, bpm?: number}} options
     * @returns {Uint8Array}
     */
    function buildSimpleMIDI(noteList, options = {}) {
        const ticksPerBeat = options.ticksPerBeat || 480;
        const bpm = options.bpm || 120;
        const tempo = Math.round(60000000 / bpm);

        const parts = [];

        function pushBytes(arr) {
            parts.push(new Uint8Array(arr));
        }
        function push32be(v) {
            const b = new Uint8Array(4);
            b[0] = (v >> 24) & 0xFF;
            b[1] = (v >> 16) & 0xFF;
            b[2] = (v >> 8) & 0xFF;
            b[3] = v & 0xFF;
            parts.push(b);
        }
        function push16be(v) {
            const b = new Uint8Array(2);
            b[0] = (v >> 8) & 0xFF;
            b[1] = v & 0xFF;
            parts.push(b);
        }
        function push8(v) {
            parts.push(new Uint8Array([v & 0xFF]));
        }

        const sorted = [...noteList].sort((a, b) => {
            if (a.startTick !== b.startTick) return a.startTick - b.startTick;
            return (a.duration || 0) - (b.duration || 0);
        });

        const trackEvents = [];

        trackEvents.push({ tick: 0, data: [EVENT.META, META_TYPE.TRACK_NAME, 7, 77, 105, 100, 105, 32, 84, 114, 107] || [0xFF, 0x03, 0] });
        trackEvents.push({
            tick: 0,
            data: [EVENT.META, META_TYPE.SET_TEMPO, 3, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF]
        });
        trackEvents.push({
            tick: 0,
            data: [EVENT.META, META_TYPE.TIME_SIGNATURE, 4, 4, 2, 24, 8]
        });

        for (const n of sorted) {
            const ch = n.channel || 0;
            const vel = n.velocity || 100;
            trackEvents.push({
                tick: n.startTick,
                data: [EVENT.NOTE_ON | ch, n.note, vel]
            });
            trackEvents.push({
                tick: n.startTick + (n.duration || ticksPerBeat),
                data: [EVENT.NOTE_ON | ch, n.note, 0]
            });
        }

        trackEvents.sort((a, b) => a.tick - b.tick);

        const endTick = trackEvents.length > 0 ? trackEvents[trackEvents.length - 1].tick + 1 : 1;
        trackEvents.push({
            tick: endTick,
            data: [EVENT.META, META_TYPE.END_OF_TRACK, 0]
        });

        const trackData = [];
        let lastTick = 0;
        for (const ev of trackEvents) {
            const delta = ev.tick - lastTick;
            lastTick = ev.tick;
            trackData.push(...writeVLQ(delta));
            trackData.push(...ev.data);
        }

        const trackBytes = new Uint8Array(trackData);
        const trackSize = trackBytes.length;

        const headerSize = 14;
        const totalSize = headerSize + 8 + trackSize;

        pushBytes([0x4D, 0x54, 0x68, 0x64]);
        push32be(6);
        push16be(0);
        push16be(1);
        push16be(ticksPerBeat);

        pushBytes([0x4D, 0x54, 0x72, 0x6B]);
        push32be(trackSize);
        parts.push(trackBytes);

        const totalBytes = parts.reduce((sum, p) => sum + p.length, 0);
        const result = new Uint8Array(totalBytes);
        let offset = 0;
        for (const p of parts) {
            result.set(p, offset);
            offset += p.length;
        }
        return result;
    }

    /**
     * 量化 note 列表到指定网格
     */
    function quantize(notes, gridTicks) {
        return notes.map(n => ({
            ...n,
            startTick: Math.round(n.startTick / gridTicks) * gridTicks,
            duration: Math.round((n.duration || 0) / gridTicks) * gridTicks
        }));
    }

    return {
        EVENT,
        META_TYPE,
        readVLQ,
        writeVLQ,
        parseHeader,
        parseTrack,
        extractNotes,
        buildTempoMap,
        tickToSeconds,
        buildSimpleMIDI,
        quantize
    };
})();

if (typeof window !== 'undefined') {
    window.MIDIUtils = MIDIUtils;
}