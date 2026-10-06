/**
 * mel-spectrogram.js — 梅尔谱图轻量计算（Web Audio API）
 *
 * 纯浏览器端实现 STFT + Mel 滤波器组，无需后端。
 * 输出: 二维数组 [timeFrames][melBins] 的 Float32Array
 */

const MelSpectrogram = (() => {

    /**
     * 生成 Mel 刻度滤波器组
     * @param {number} nFFT - FFT 大小
     * @param {number} sampleRate - 采样率
     * @param {number} nMelBins - Mel 频带数
     * @param {number} fMin - 最低频率 (Hz)
     * @param {number} fMax - 最高频率 (Hz)
     * @returns {Float32Array[]} melBins × (nFFT/2+1) 的权重矩阵
     */
    function createMelFilterbank(nFFT, sampleRate, nMelBins = 128, fMin = 0, fMax = null) {
        if (fMax === null) fMax = sampleRate / 2;

        function hzToMel(hz) {
            return 2595.0 * Math.log10(1.0 + hz / 700.0);
        }
        function melToHz(mel) {
            return 700.0 * (Math.pow(10.0, mel / 2595.0) - 1.0);
        }
        function freqToBin(f) {
            return Math.floor((nFFT + 1) * f / sampleRate);
        }

        const melMin = hzToMel(fMin);
        const melMax = hzToMel(fMax);
        const melPoints = nMelBins + 2;
        const melStep = (melMax - melMin) / (melPoints - 1);

        const melFreqs = new Float32Array(melPoints);
        for (let i = 0; i < melPoints; i++) {
            melFreqs[i] = melToHz(melMin + i * melStep);
        }

        const binIndices = new Int32Array(melPoints);
        for (let i = 0; i < melPoints; i++) {
            binIndices[i] = freqToBin(melFreqs[i]);
        }

        const numFreqBins = Math.floor(nFFT / 2) + 1;
        const filterbank = [];
        for (let m = 0; m < nMelBins; m++) {
            const weights = new Float32Array(numFreqBins);
            const startBin = binIndices[m];
            const centerBin = binIndices[m + 1];
            const endBin = binIndices[m + 2];

            for (let k = startBin; k < centerBin; k++) {
                weights[k] = (k - startBin) / (centerBin - startBin);
            }
            for (let k = centerBin; k <= endBin && k < numFreqBins; k++) {
                weights[k] = (endBin - k) / (endBin - centerBin);
            }
            filterbank.push(weights);
        }
        return filterbank;
    }

    /**
     * 计算 STFT 幅度谱
     * @param {Float32Array} samples - 单声道 PCM 采样
     * @param {number} nFFT - FFT 大小
     * @param {number} hopLength - 跳步大小
     * @param {string} windowType - 'hann' | 'hamming'
     * @returns {Float32Array[]} 每帧的幅度谱
     */
    function computeSTFT(samples, nFFT = 2048, hopLength = 512, windowType = 'hann') {
        const numFrames = Math.floor((samples.length - nFFT) / hopLength) + 1;
        const numBins = Math.floor(nFFT / 2) + 1;
        const result = [];

        const window = new Float32Array(nFFT);
        for (let i = 0; i < nFFT; i++) {
            if (windowType === 'hann') {
                window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (nFFT - 1)));
            } else if (windowType === 'hamming') {
                window[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (nFFT - 1));
            } else {
                window[i] = 1.0;
            }
        }

        for (let frame = 0; frame < numFrames; frame++) {
            const start = frame * hopLength;
            const frameSamples = new Float32Array(nFFT * 2); // complex: real + imag interleaved

            for (let i = 0; i < nFFT; i++) {
                frameSamples[i * 2] = samples[start + i] * window[i];
                frameSamples[i * 2 + 1] = 0;
            }

            const spectrum = simpleFFT(frameSamples);
            const magnitudes = new Float32Array(numBins);
            for (let k = 0; k < numBins; k++) {
                const real = spectrum[k * 2];
                const imag = spectrum[k * 2 + 1];
                magnitudes[k] = Math.sqrt(real * real + imag * imag);
            }
            result.push(magnitudes);
        }
        return result;
    }

    /**
     * 简易 Cooley-Tukey FFT（幂 2）
     */
    function simpleFFT(complexArray) {
        const N = complexArray.length / 2;
        if (N <= 1) return complexArray;

        if ((N & (N - 1)) !== 0) {
            throw new Error(`FFT size must be power of 2, got ${N}`);
        }

        const even = new Float32Array(N);
        const odd = new Float32Array(N);
        for (let i = 0; i < N / 2; i++) {
            even[i * 2] = complexArray[i * 4];
            even[i * 2 + 1] = complexArray[i * 4 + 1];
            odd[i * 2] = complexArray[(i * 2 + 1) * 2];
            odd[i * 2 + 1] = complexArray[(i * 2 + 1) * 2 + 1];
        }

        const evenFFT = simpleFFT(even);
        const oddFFT = simpleFFT(odd);

        const result = new Float32Array(N * 2);
        for (let k = 0; k < N / 2; k++) {
            const angle = -2 * Math.PI * k / N;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const tReal = cos * oddFFT[k * 2] - sin * oddFFT[k * 2 + 1];
            const tImag = sin * oddFFT[k * 2] + cos * oddFFT[k * 2 + 1];

            result[k * 2] = evenFFT[k * 2] + tReal;
            result[k * 2 + 1] = evenFFT[k * 2 + 1] + tImag;
            result[(k + N / 2) * 2] = evenFFT[k * 2] - tReal;
            result[(k + N / 2) * 2 + 1] = evenFFT[k * 2 + 1] - tImag;
        }
        return result;
    }

    /**
     * 将 STFT 幅度谱应用 Mel 滤波器组
     * @returns {Float32Array[]} [timeFrames][melBins]
     */
    function applyMelFilterbank(stftMag, filterbank) {
        const numFrames = stftMag.length;
        const numMelBins = filterbank.length;
        const result = [];

        for (let t = 0; t < numFrames; t++) {
            const melFrame = new Float32Array(numMelBins);
            const spectrum = stftMag[t];

            for (let m = 0; m < numMelBins; m++) {
                let sum = 0;
                const weights = filterbank[m];
                for (let k = 0; k < weights.length; k++) {
                    sum += weights[k] * spectrum[k];
                }
                melFrame[m] = sum;
            }
            result.push(melFrame);
        }
        return result;
    }

    /**
     * 转为 dB 刻度
     */
    function toDecibel(melSpectrogram, ref = 1.0, minDb = -80) {
        return melSpectrogram.map(frame => {
            const dbFrame = new Float32Array(frame.length);
            for (let i = 0; i < frame.length; i++) {
                const val = frame[i];
                const db = 20 * Math.log10(Math.max(val, 1e-10) / ref);
                dbFrame[i] = Math.max(db, minDb);
            }
            return dbFrame;
        });
    }

    /**
     * 从 AudioBuffer 计算梅尔谱图
     * @param {AudioBuffer} audioBuffer
     * @param {{nFFT?: number, hopLength?: number, nMelBins?: number, fMin?: number, toDb?: boolean}} options
     * @returns {{ data: Float32Array[][], sampleRate: number, timeFrames: number, melBins: number }}
     */
    function fromAudioBuffer(audioBuffer, options = {}) {
        const sampleRate = audioBuffer.sampleRate;
        const nFFT = options.nFFT || 2048;
        const hopLength = options.hopLength || 512;
        const nMelBins = options.nMelBins || 128;
        const fMin = options.fMin || 0;
        const toDb = options.toDb !== false;

        const channelData = audioBuffer.getChannelData(0);
        const samples = channelData.length <= nFFT * 2
            ? channelData
            : channelData.slice(0, nFFT * 2 + hopLength * 500);

        const stftMag = computeSTFT(samples, nFFT, hopLength, 'hann');
        const filterbank = createMelFilterbank(nFFT, sampleRate, nMelBins, fMin);
        let melData = applyMelFilterbank(stftMag, filterbank);

        if (toDb) {
            melData = toDecibel(melData);
        }

        return {
            data: melData,
            sampleRate,
            timeFrames: melData.length,
            melBins: nMelBins,
            hopLength,
            nFFT
        };
    }

    /**
     * 绘制梅尔谱图到 Canvas
     * @param {CanvasRenderingContext2D} ctx
     * @param {Float32Array[]} melData - dB 刻度数据
     * @param {number} width
     * @param {number} height
     * @param {{minDb?: number, maxDb?: number}} options
     */
    function drawToCanvas(ctx, melData, width, height, options = {}) {
        const minDb = options.minDb ?? -80;
        const maxDb = options.maxDb ?? 0;
        const numFrames = melData.length;
        const numBins = melData[0].length;

        const imageData = ctx.createImageData(width, height);

        for (let y = 0; y < height; y++) {
            const bin = Math.floor((height - 1 - y) / height * numBins);
            const bw = width / numFrames;

            for (let x = 0; x < width; x++) {
                const frame = Math.floor(x / bw);

                if (frame < numFrames && bin < numBins) {
                    const db = melData[frame][bin];
                    const t = (db - minDb) / (maxDb - minDb);
                    const clamped = Math.max(0, Math.min(1, t));

                    const idx = (y * width + x) * 4;
                    const r = Math.floor(clamped * 255);
                    const g = Math.floor(clamped * 180);
                    const b = Math.floor(clamped * 100 + (1 - clamped) * 40);

                    imageData.data[idx] = r;
                    imageData.data[idx + 1] = g;
                    imageData.data[idx + 2] = b;
                    imageData.data[idx + 3] = 255;
                }
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    return {
        createMelFilterbank,
        computeSTFT,
        applyMelFilterbank,
        toDecibel,
        fromAudioBuffer,
        drawToCanvas,
        simpleFFT
    };
})();

if (typeof window !== 'undefined') {
    window.MelSpectrogram = MelSpectrogram;
}