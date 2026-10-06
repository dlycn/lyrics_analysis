/**
 * abc-utils.js — ABC 记谱法轻量工具
 *
 * 依赖: abcjs-basic-min.js (全局 ABCJS) 用于渲染/解析
 * 纯 JS 实现轻量补充: 校验、字段提取、音名转换
 */

const ABCUtils = (() => {

    /** 音符名 → MIDI 音符号映射（C4=60） */
    const NOTE_TO_SEMITONE = {
        'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
    };
    const ACCIDENTAL_OFFSET = { '': 0, '#': 1, 'b': -1, '^': 1, '_': -1, '=': 0 };

    /**
     * 基本校验：是否包含 X: 和 K: 字段
     */
    function isValid(abc) {
        return /^X:\s*\d+/m.test(abc) && /^K:\s*\S/m.test(abc);
    }

    /**
     * 提取 ABC 头部字段值
     * @returns {object} { X, T, C, M, L, K, ... }
     */
    function parseHeaders(abc) {
        const headers = {};
        const headerRe = /^([A-Za-z]):\s*(.*)$/gm;
        let m;
        while ((m = headerRe.exec(abc)) !== null) {
            const key = m[1].toUpperCase();
            const value = m[2].trim();
            if (key !== 'K' || headers[key] === undefined) {
                headers[key] = value;
            }
        }
        return headers;
    }

    /**
     * 提取 ABC 曲谱中的音符 token 列表
     * 用于 AI 训练数据预处理
     */
    function extractTokens(abc) {
        const body = abc.replace(/^[A-Za-z]:.*$/gm, '').trim();
        const tokens = [];
        const tokenRe = /(\^{1,2}|_{1,2}|=)?[A-Ga-g]('[',]*|[,']*)/g;
        let m;
        while ((m = tokenRe.exec(body)) !== null) {
            tokens.push(m[0]);
        }
        return tokens;
    }

    /**
     * 将 ABC 音符 token 转为 MIDI 音符号
     * 例如: "C"→60, "^C"→61, "_D"→61, "c"→72
     */
    function tokenToMidi(token) {
        const m = token.match(/^(\^{1,2}|_{1,2}|=)?([A-Ga-g])('[',]*|[,']*)$/);
        if (!m) return null;

        let accidental = m[1] || '';
        accidental = accidental.replace('^', '#').replace('_', 'b');
        const noteLetter = m[2].toUpperCase();
        const octaveMod = m[3] || '';

        const baseClass = NOTE_TO_SEMITONE[noteLetter];
        if (baseClass === undefined) return null;

        const accOffset = ACCIDENTAL_OFFSET[accidental] || 0;

        let octave;
        if (m[2] === m[2].toLowerCase()) {
            octave = 5;
            for (const ch of octaveMod) {
                if (ch === "'") octave++;
                else if (ch === ',') octave--;
            }
        } else {
            octave = 4;
            for (const ch of octaveMod) {
                if (ch === "'") octave++;
                else if (ch === ',') octave--;
            }
        }

        return (octave + 1) * 12 + baseClass + accOffset;
    }

    /**
     * 将 MIDI 音符号转为 ABC token
     */
    function midiToToken(midi) {
        const noteNames = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
        const accidentals = ['', '^', '', '^', '', '', '^', '', '^', '', '^', ''];
        const semitone = midi % 12;
        const octave = Math.floor(midi / 12) - 1;

        let name = noteNames[semitone];
        const acc = accidentals[semitone];

        const isUpper = octave < 5;
        const letter = isUpper ? name : name.toLowerCase();
        const baseOctave = isUpper ? 4 : 5;
        const diff = octave - baseOctave;

        let commas = '';
        let primes = '';
        if (diff > 0) primes = "'".repeat(diff);
        else if (diff < 0) commas = ','.repeat(-diff);

        return acc + letter + primes + commas;
    }

    /**
     * 获取拍号信息
     */
    function parseMeter(mField) {
        if (!mField) return { num: 4, den: 4 };
        if (mField.toUpperCase() === 'C') return { num: 4, den: 4 };
        if (mField.toUpperCase() === 'C|') return { num: 2, den: 2 };
        const parts = mField.split('/');
        return {
            num: parseInt(parts[0]) || 4,
            den: parseInt(parts[1]) || 4
        };
    }

    /**
     * 获取调性信息
     */
    function parseKey(kField) {
        if (!kField) return { tonic: 'C', mode: 'major', sharps: 0 };
        const key = kField.trim();
        const sharpsFlats = {
            'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
            'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6, 'Cb': -7
        };
        let tonic = key.replace(/m(?:in(?:or)?)?$/i, '');
        let mode = /m/.test(key) ? 'minor' : 'major';

        tonic = tonic.trim();
        if (tonic === '') tonic = 'C';

        const sf = sharpsFlats[tonic] ?? 0;
        return { tonic, mode, sharps: mode === 'minor' ? sf - 3 : sf };
    }

    /**
     * 生成一段最简单的 ABC 模板
     */
    function createTemplate(options = {}) {
        const title = options.title || 'Untitled';
        const key = options.key || 'C';
        const meter = options.meter || '4/4';
        const notes = options.notes || '|CDEF GABc|';

        return [
            `X:1`,
            `T:${title}`,
            `M:${meter}`,
            `L:1/4`,
            `K:${key}`,
            notes
        ].join('\n');
    }

    return {
        isValid,
        parseHeaders,
        extractTokens,
        tokenToMidi,
        midiToToken,
        parseMeter,
        parseKey,
        createTemplate
    };
})();

if (typeof window !== 'undefined') {
    window.ABCUtils = ABCUtils;
}