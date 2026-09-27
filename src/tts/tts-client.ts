/**
 * Common TTS client interface, so the pipeline orchestration stays decoupled
 * from the provider. VieNeu-TTS is the default (Apache-2.0, monetization OK);
 * OmniVoice is kept for old scripts but its model is CC-BY-NC.
 */
export interface TtsOptions {
  /** Provider-specific voice name (VieNeu preset, e.g. "Hải Đăng"). */
  voice?: string;
  /** Speaking-rate multiplier, 1.0 = natural. */
  speed?: number;
}

export interface TtsClient {
  /**
   * Generate speech audio for `text` and write to `audioOutPath` (mp3 or wav).
   * If `srtOutPath` is provided AND the provider supports subtitles,
   * write the SRT to that path. Otherwise silently skip.
   * Providers that cannot honour an option in `opts` ignore it.
   */
  generate(text: string, audioOutPath: string, srtOutPath?: string, opts?: TtsOptions): Promise<void>;
}

import type { Config, TtsProvider } from "../config.js";
import { OmniVoiceClient } from "./omnivoice-client.js";
import { VieneuClient } from "./vieneu-client.js";

export function createTtsClient(cfg: Config, provider: TtsProvider = cfg.ttsProvider): TtsClient {
  switch (provider) {
    case "vieneu":
      return new VieneuClient({
        endpoint: cfg.vieneuEndpoint,
        defaultVoice: cfg.vieneuVoice,
        apiKey: cfg.vieneuApiKey,
      });
    case "omnivoice":
      return new OmniVoiceClient({ endpoint: cfg.omnivoiceEndpoint });
  }
}
