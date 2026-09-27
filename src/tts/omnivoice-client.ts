import axios, { AxiosError } from "axios";
import { writeFile } from "node:fs/promises";
import type { TtsClient } from "./tts-client.js";

export interface OmniVoiceOpts {
  endpoint: string; // e.g. "http://127.0.0.1:8123"
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// OmniVoice local TTS: POST { text } → audio/mpeg bytes.
// No API key or voice ID — configured server-side.
// srtOutPath and opts (voice/speed) are ignored.
// The OmniVoice model is CC-BY-NC: do not use it for monetized videos.
export class OmniVoiceClient implements TtsClient {
  constructor(private cfg: OmniVoiceOpts) {}

  async generate(text: string, audioOutPath: string, _srtOutPath?: string): Promise<void> {
    const delays = [1000, 2000, 4000];
    let lastErr: unknown;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const resp = await axios.post<ArrayBuffer>(
          `${this.cfg.endpoint}/tts`,
          { text },
          { headers: { "Content-Type": "application/json", Accept: "audio/mpeg" }, responseType: "arraybuffer", timeout: 60000 },
        );
        await writeFile(audioOutPath, Buffer.from(resp.data));
        return;
      } catch (e) {
        lastErr = e;
        const status = (e as AxiosError).response?.status;
        if (status !== undefined && status < 500 && status !== 429) {
          throw new Error(`OmniVoice TTS failed (status ${status})`);
        }
        if (attempt < delays.length) await sleep(delays[attempt]);
      }
    }
    throw lastErr;
  }
}
