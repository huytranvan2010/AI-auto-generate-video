import axios, { AxiosError } from "axios";
import { spawn } from "node:child_process";
import type { TtsClient, TtsOptions } from "./tts-client.js";

export interface VieneuOpts {
  /** VieNeu OpenAI-compatible server, e.g. "http://127.0.0.1:8000". */
  endpoint: string;
  /** Preset used when a call passes no voice; undefined → server default. */
  defaultVoice?: string;
  apiKey?: string;
  /** Backoff between retries on 5xx/429/network errors. */
  retryDelaysMs?: number[];
  timeoutMs?: number;
}

/** Native VieNeu v3 Turbo rate; requesting it avoids a server-side resample. */
export const VIENEU_SAMPLE_RATE = 48000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// VieNeu local TTS via its OpenAI-compatible API (apps/openai_speech.py):
// POST /v1/audio/speech { input, voice, response_format: "pcm" } → s16le mono PCM.
// We ask for raw PCM rather than "wav" because the streamed WAV header carries
// an unknown length, which breaks duration probing. The server ignores `speed`,
// so the rate is applied locally with FFmpeg atempo (tempo change, same pitch).
export class VieneuClient implements TtsClient {
  constructor(private cfg: VieneuOpts) {}

  async generate(text: string, audioOutPath: string, _srtOutPath?: string, opts: TtsOptions = {}): Promise<void> {
    const pcm = await this.synthesize(text, opts.voice ?? this.cfg.defaultVoice);
    await encodePcm(pcm, audioOutPath, opts.speed ?? 1);
  }

  private async synthesize(text: string, voice: string | undefined): Promise<Buffer> {
    const delays = this.cfg.retryDelaysMs ?? [1000, 2000, 4000];
    const url = `${this.cfg.endpoint}/v1/audio/speech`;
    let lastErr: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const resp = await axios.post<ArrayBuffer>(
          url,
          {
            model: "vieneu-v3-turbo",
            input: text,
            ...(voice ? { voice } : {}),
            response_format: "pcm",
            sample_rate: VIENEU_SAMPLE_RATE,
          },
          {
            headers: {
              "Content-Type": "application/json",
              ...(this.cfg.apiKey ? { Authorization: `Bearer ${this.cfg.apiKey}` } : {}),
            },
            responseType: "arraybuffer",
            // CPU synthesis runs at roughly real time, so allow long scenes.
            timeout: this.cfg.timeoutMs ?? 300_000,
          },
        );
        const pcm = Buffer.from(resp.data);
        if (pcm.length < 2) throw new Error(`VieNeu returned no audio for "${text.slice(0, 40)}…"`);
        return pcm;
      } catch (e) {
        lastErr = e;
        const err = e as AxiosError;
        const status = err.response?.status;
        if (status !== undefined && status < 500 && status !== 429) {
          throw new Error(`VieNeu TTS failed (status ${status}): ${errorMessage(err)}`);
        }
        if (err.code === "ECONNREFUSED") {
          lastErr = new Error(
            `Cannot reach VieNeu at ${this.cfg.endpoint}. Start it in the VieNeu-TTS repo: ` +
              `HOST=127.0.0.1 uv run python -m apps.openai_speech`,
          );
        }
        if (attempt < delays.length) await sleep(delays[attempt]);
      }
    }
    throw lastErr;
  }
}

/** Pull the OpenAI-shaped `{error:{message}}` out of an arraybuffer error body. */
function errorMessage(err: AxiosError): string {
  const data = err.response?.data;
  if (!data) return err.message;
  const raw = Buffer.from(data as ArrayBuffer).toString("utf8");
  try {
    return JSON.parse(raw)?.error?.message ?? raw;
  } catch {
    return raw;
  }
}

/** Encode raw s16le mono PCM to mp3 or wav (by extension), applying `speed`. */
export function encodePcm(pcm: Buffer, outPath: string, speed: number): Promise<void> {
  const codec = outPath.toLowerCase().endsWith(".wav")
    ? ["-c:a", "pcm_s16le"]
    : ["-c:a", "libmp3lame", "-b:a", "192k"];
  const args = [
    "-y", "-loglevel", "error",
    "-f", "s16le", "-ar", String(VIENEU_SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
    ...(speed !== 1 ? ["-af", `atempo=${speed}`] : []),
    ...codec,
    outPath,
  ];
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg encode failed (exit ${code}): ${err.slice(-500)}`)),
    );
    proc.stdin.on("error", reject);
    proc.stdin.end(pcm);
  });
}
