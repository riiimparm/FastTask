// 操作音。音源ファイルは使わず Web Audio でシンセ生成（ライセンス不要・バイナリ増ゼロ・依存ゼロ）。
// 呼び出し側（store）が settings.soundEnabled を見て呼ぶ。無効時はここに来ないので AudioContext も作られない。

export type SoundKind = "create" | "complete" | "delete" | "nav";

/** 同種音の最小間隔(ms)。連打で音が重なって割れるのを防ぐ */
const THROTTLE_MS = 60;

/** 直近再生時刻を見て再生可否を判定する純粋関数（テスト用に分離） */
export function shouldPlay(
  kind: SoundKind,
  now: number,
  last: Record<string, number>,
  intervalMs: number = THROTTLE_MS,
): boolean {
  const prev = last[kind];
  return prev === undefined || now - prev >= intervalMs;
}

type Note = { freq: number; at: number; dur: number; gain: number; type: OscillatorType };

// 短いトランジェント。耳に刺さらないよう 1kHz 以下中心・既定音量は控えめ。
const VOICES: Record<SoundKind, Note[]> = {
  // 作成: 軽いブリップ（A5, 三角波 50ms）
  create: [{ freq: 880, at: 0, dur: 0.05, gain: 0.09, type: "triangle" }],
  // 完了: 上行2音（E5 -> B5）で達成感を出す
  complete: [
    { freq: 659.25, at: 0, dur: 0.07, gain: 0.08, type: "sine" },
    { freq: 987.77, at: 0.065, dur: 0.11, gain: 0.08, type: "sine" },
  ],
  // 削除: 下行2音（A4 -> D4）
  delete: [
    { freq: 440, at: 0, dur: 0.06, gain: 0.07, type: "sine" },
    { freq: 293.66, at: 0.055, dur: 0.1, gain: 0.07, type: "sine" },
  ],
  // 移動: ごく短く静かなクリック（A6 25ms）
  nav: [{ freq: 1174.66, at: 0, dur: 0.025, gain: 0.035, type: "sine" }],
};

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
    osc.frequency.setValueAtTime(n.freq, t0 + n.at);
    // 指数減衰エンベロープ（1ms でピーク → 減衰、クリックノイズを避ける）
    const peak = Math.max(0.0001, n.gain * volume);
    gain.gain.setValueAtTime(0.0001, t0 + n.at);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.01);
  }
}
