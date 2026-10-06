/**
 * audio-utils.js — 音频缓冲 / SoundFont 轻量工具
 *
 * 依赖: Web Audio API
 * 功能: AudioBuffer 加载, SoundFont note 播放, WAV 编码, 音频拼接
 */

const AudioUtils = (() => {

    let _audioCtx = null;

    function getAudioContext() {
        if (!_audioCtx) {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return _audioCtx;
    }

    /**
     * 从 URL 加载音频并解码为 AudioBuffer
     */
    async function loadAudioBuffer(url) {
        const ctx = getAudioContext();
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return ctx.decodeAudioData(arrayBuffer);
    }

    /**
     * 从 ArrayBuffer 解码
     */
    async function decodeArrayBuffer(arrayBuffer) {
        const ctx = getAudioContext();
        return ctx.decodeAudioData(arrayBuffer.slice(0));
    }

    /**
     * AudioBuffer → Float32Array（单声道，左声道）
     */
    function toMonoSamples(audioBuffer) {
        const channel = audioBuffer.getChannelData(0);
        if (audioBuffer.numberOfChannels === 1) {
            return new Float32Array(channel);
        }
        const result = new Float32Array(audioBuffer.length);
        for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
            const data = audioBuffer.getChannelData(ch);
            for (let i = 0; i < audioBuffer.length; i++) {
                result[i] += data[i];
            }
        }
        for (let i = 0; i < result.length; i++) {
            result[i] /= audioBuffer.numberOfChannels;
        }
        return result;
    }

    /**
     * Float32Array → AudioBuffer
     */
    function fromSamples(samples, sampleRate = 44100, numChannels = 1) {
        const ctx = getAudioContext();
        const buffer = ctx.createBuffer(numChannels, samples.length, sampleRate);
        for (let ch = 0; ch < numChannels; ch++) {
            buffer.getChannelData(ch).set(samples);
        }
        return buffer;
    }

    /**
     * 拼接多个 AudioBuffer
     */
    function concatAudioBuffers(buffers) {
        if (buffers.length === 0) return null;
        const sampleRate = buffers[0].sampleRate;
        const numChannels = buffers[0].numberOfChannels;
        const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);

        const ctx = getAudioContext();
        const result = ctx.createBuffer(numChannels, totalLength, sampleRate);

        let offset = 0;
        for (const buf of buffers) {
            for (let ch = 0; ch < numChannels; ch++) {
                const src = buf.getChannelData(ch);
                const dst = result.getChannelData(ch);
                dst.set(src, offset);
            }
            offset += buf.length;
        }
        return result;
    }

    /**
     * 播放 AudioBuffer
     * @returns {{ source: AudioBufferSourceNode, stop: Function }}
     */
    function playAudioBuffer(audioBuffer, options = {}) {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') ctx.resume();

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;

        const gainNode = ctx.createGain();
        gainNode.gain.value = options.gain ?? 1.0;

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        source.start(0, options.offset || 0, options.duration);

        return {
            source,
            gainNode,
            stop() { source.stop(); }
        };
    }

    /**
     * 从 SoundFont note 样本播放单个音符
     * @param {AudioBuffer} sfNoteBuffer - SoundFont 中单个音符样本
     * @param {number} midiNote - 目标 MIDI 音符
     * @param {number} rootNote - 样本的原始 MIDI 音符
     * @param {number} duration - 持续秒数
     */
    function playSfNote(sfNoteBuffer, midiNote, rootNote, duration = 1.0) {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') ctx.resume();

        const semitoneDiff = midiNote - rootNote;
        const playbackRate = Math.pow(2, semitoneDiff / 12);

        const source = ctx.createBufferSource();
        source.buffer = sfNoteBuffer;
        source.playbackRate.value = playbackRate;

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.8, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        source.start(0);
        source.stop(ctx.currentTime + duration);

        return { source, gainNode, stop() { source.stop(); } };
    }

    /**
     * 创建立体声白噪声
     */
    function createNoise(duration, sampleRate = 44100) {
        const ctx = getAudioContext();
        const length = Math.floor(duration * sampleRate);
        const buffer = ctx.createBuffer(2, length, sampleRate);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        }
        return buffer;
    }

    /**
     * 生成正弦波
     */
    function createSine(frequency, duration, sampleRate = 44100, amplitude = 0.5) {
        const ctx = getAudioContext();
        const length = Math.floor(duration * sampleRate);
        const buffer = ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            data[i] = amplitude * Math.sin(2 * Math.PI * frequency * t);
        }
        return buffer;
    }

    /**
     * AudioBuffer → WAV ArrayBuffer
     */
    function toWavArrayBuffer(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const length = audioBuffer.length;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const dataSize = length * numChannels * bytesPerSample;
        const headerSize = 44;
        const totalSize = headerSize + dataSize;

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);

        writeString(view, 0, 'RIFF');
        view.setUint32(4, totalSize - 8, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
        view.setUint16(32, numChannels * bytesPerSample, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        let offset = 44;
        for (let i = 0; i < length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
                const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, int16, true);
                offset += 2;
            }
        }
        return buffer;
    }

    function writeString(view, offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    /**
     * AudioBuffer → Blob（可下载）
     */
    function toWavBlob(audioBuffer) {
        const arrayBuffer = toWavArrayBuffer(audioBuffer);
        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    /**
     * MusicXML 音符名 → MIDI 音符号
     */
    function musicXmlToMidi({ step, octave, alter = 0 }) {
        const noteMap = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
        const base = (octave + 1) * 12;
        return base + (noteMap[step] || 0) + alter;
    }

    return {
        getAudioContext,
        loadAudioBuffer,
        decodeArrayBuffer,
        toMonoSamples,
        fromSamples,
        concatAudioBuffers,
        playAudioBuffer,
        playSfNote,
        createNoise,
        createSine,
        toWavArrayBuffer,
        toWavBlob,
        musicXmlToMidi
    };
})();

if (typeof window !== 'undefined') {
    window.AudioUtils = AudioUtils;
}