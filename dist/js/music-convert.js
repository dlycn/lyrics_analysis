/**
 * music-convert.js — 音乐表征转换注册中心
 *
 * 维护一个 5 节点有向图，用 BFS 查找最短转换路径。
 * 每个节点代表一种音乐表征，每条边代表一个注册的转换函数。
 *
 * 五种表征类型（Graph Nodes）:
 *   mp3           - 音频 (AudioBuffer | ArrayBuffer)
 *   abc           - ABC 记谱文本 (string)
 *   midi          - MIDI 字节序列 (Uint8Array)
 *   sheetpng      - 乐谱图像 (ImageBitmap | Blob)
 *   melspectrogram - 梅尔谱图 (Float32Array[][])
 */

const nodeNames = ['mp3', 'abc', 'midi', 'sheetpng', 'melspectrogram'];

class ConversionGraph {
    constructor() {
        this.adj = {};
        for (const name of nodeNames) {
            this.adj[name] = [];
        }
    }

    /**
     * 注册一条有向转换边
     * @param {string} from - 源格式: 'mp3'|'abc'|'midi'|'sheetpng'|'melspectrogram'
     * @param {string} to - 目标格式
     * @param {Function} fn - async (input, options?) => output
     * @param {{cost: number, label: string}} meta
     */
    register(from, to, fn, meta = {}) {
        const edge = {
            to,
            fn,
            cost: meta.cost ?? 1,
            label: meta.label ?? `${from}→${to}`
        };
        this.adj[from].push(edge);
    }

    /**
     * BFS 找最短路径，返回 [nodeName, ...] 序列
     */
    findPath(from, to) {
        if (from === to) return [from];
        const visited = new Set();
        const queue = [[from]];
        visited.add(from);

        while (queue.length) {
            const path = queue.shift();
            const current = path[path.length - 1];
            for (const edge of this.adj[current]) {
                if (edge.to === to) return [...path, edge.to];
                if (!visited.has(edge.to)) {
                    visited.add(edge.to);
                    queue.push([...path, edge.to]);
                }
            }
        }
        return null;
    }

    /**
     * 沿路径逐跳执行转换
     * @param {*} input - 初始输入
     * @param {string} from - 源格式
     * @param {string} to - 目标格式
     * @param {object} [options] - 透传给每个转换函数
     * @returns {Promise<*>} 最终输出
     */
    async convert(input, from, to, options = {}) {
        if (from === to) return input;
        const path = this.findPath(from, to);
        if (!path) {
            throw new Error(`[music-convert] 未找到从 "${from}" 到 "${to}" 的转换路径`);
        }

        let current = input;
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i];
            const b = path[i + 1];
            const edge = this.adj[a].find(e => e.to === b);
            if (!edge) {
                throw new Error(`[music-convert] 内部错误: 边 ${a}→${b} 丢失`);
            }
            current = await edge.fn(current, options);
        }
        return current;
    }

    /**
     * 导出图结构（用于可视化）
     */
    graph() {
        const result = {};
        for (const [from, edges] of Object.entries(this.adj)) {
            result[from] = edges.map(e => ({
                to: e.to,
                cost: e.cost,
                label: e.label
            }));
        }
        return result;
    }

    /**
     * 获取所有可达格式
     */
    reachable(from) {
        const visited = new Set();
        const queue = [from];
        visited.add(from);
        while (queue.length) {
            const cur = queue.shift();
            for (const edge of this.adj[cur]) {
                if (!visited.has(edge.to)) {
                    visited.add(edge.to);
                    queue.push(edge.to);
                }
            }
        }
        visited.delete(from);
        return [...visited];
    }
}

const g = new ConversionGraph();

if (typeof window !== 'undefined') {
    window.MusicConvert = g;
    window.ConversionGraph = ConversionGraph;
    window.ConversionNodeNames = nodeNames;
}