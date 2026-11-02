// 操作音。音源ファイルは使わず Web Audio でシンセ生成（ライセンス不要・バイナリ増ゼロ・依存ゼロ）。
// 呼び出し側（store）が settings.soundEnabled を見て呼ぶ。無効時はここに来ないので AudioContext も作られない。

export type SoundKind = "create" | "complete" | "delete" | "nav" | "type";

/** 同種音の最小間隔(ms)。連打で音が重なって割れるのを防ぐ */
const THROTTLE_MS = 60;

/** タイプ音だけは速い連打が前提なので短く */
const THROTTLE_BY_KIND: Partial<Record<SoundKind, number>> = { type: 18 };

export function throttleFor(kind: SoundKind): number {
  return THROTTLE_BY_KIND[kind] ?? THROTTLE_MS;
}

/** 直近再生時刻を見て再生可否を判定する純粋関数（テスト用に分離） */
export function shouldPlay(
  kind: SoundKind,
  now: number,
  last: Record<string, number>,
  intervalMs: number = throttleFor(kind),
): boolean {
  const prev = last[kind];
  return prev === undefined || now - prev >= intervalMs;
}

type Note = { freq: number; at: number; dur: number; gain: number; type: OscillatorType };

// 短いトランジェント。耳に刺さらないよう 1kHz 以下中心・既定音量は控えめ。
const VOICES: Record<SoundKind, Note[]> = {
  // 作成: 軽いブリップ（A5, 三角波 50ms）
  create: [{ freq: 880, at: 0, dur: 0.05, gain: 0.09, type: "triangle" }],
  // 完了: 明るい三和音アルペジオ（C6 -> E6 -> G6）。下の NOISE と重ねて「スカッ」と抜ける音に
  complete: [
    { freq: 1046.5, at: 0, dur: 0.14, gain: 0.07, type: "sine" },
    { freq: 1318.51, at: 0.045, dur: 0.15, gain: 0.065, type: "sine" },
    { freq: 1567.98, at: 0.085, dur: 0.22, gain: 0.06, type: "sine" },
  ],
  // 削除: 下行2音（A4 -> D4）
  delete: [
    { freq: 440, at: 0, dur: 0.06, gain: 0.07, type: "sine" },
    { freq: 293.66, at: 0.055, dur: 0.1, gain: 0.07, type: "sine" },
  ],
  // 移動: ごく短く静かなクリック（A6 25ms）
  nav: [{ freq: 1174.66, at: 0, dur: 0.025, gain: 0.035, type: "sine" }],
  // タイプ: 1打ごとに鳴るのでごく短く・ごく小さく。周波数は play() で僅かに揺らす
  type: [{ freq: 1500, at: 0, dur: 0.012, gain: 0.02, type: "triangle" }],
};

/** ノイズ成分（完了音の「スカッ」という抜け）。バンドパスを上に掃引する */
type Swish = { at: number; dur: number; gain: number; from: number; to: number };
const NOISE: Partial<Record<SoundKind, Swish>> = {
  complete: { at: 0, dur: 0.18, gain: 0.05, from: 1200, to: 6000 },
};

let noiseBuf: AudioBuffer | null = null;
function getNoiseBuffer(audio: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === audio.sampleRate) return noiseBuf;
  const len = Math.floor(audio.sampleRate * 0.3);
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

let ctx: AudioContext | null = null;
const lastPlayed: Record<string, number> = {};

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

export function play(kind: SoundKind, volume = 1): void {
  const now = Date.now();
  if (!shouldPlay(kind, now, lastPlayed)) return;
  lastPlayed[kind] = now;

  const audio = getCtx();
  if (!audio) return;
  // WebView ではユーザー操作前に suspended になることがある
  if (audio.state === "suspended") void audio.resume();

  const t0 = audio.currentTime;
  for (const n of VOICES[kind]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = n.type;
    // タイプ音は機械的に聞こえないよう毎回わずかにピッチを散らす
    const freq = kind === "type" ? n.freq * (0.96 + Math.random() * 0.08) : n.freq;
    osc.frequency.setValueAtTime(freq, t0 + n.at);
    // 指数減衰エンベロープ（1ms でピーク → 減衰、クリックノイズを避ける）
    const peak = Math.max(0.0001, n.gain * volume);
    gain.gain.setValueAtTime(0.0001, t0 + n.at);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.01);
  }

  const sw = NOISE[kind];
  if (sw) {
    const src = audio.createBufferSource();
    src.buffer = getNoiseBuffer(audio);
    const bp = audio.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(sw.from, t0 + sw.at);
    bp.frequency.exponentialRampToValueAtTime(sw.to, t0 + sw.at + sw.dur);
    const g = audio.createGain();
    const peak = Math.max(0.0001, sw.gain * volume);
    g.gain.setValueAtTime(0.0001, t0 + sw.at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + sw.at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + sw.at + sw.dur);
    src.connect(bp).connect(g).connect(audio.destination);
    src.start(t0 + sw.at);
    src.stop(t0 + sw.at + sw.dur + 0.01);
  }
}

/** キー入力1打ぶんのタイプ音。修飾キー単独とショートカット操作では鳴らさない */
export function playKeystroke(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): void {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.length !== 1 && e.key !== "Backspace" && e.key !== "Delete" && e.key !== "Enter") return;
  play("type");
}
