import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./config.js";

const ENV_KEYS = [
  "TTS_PROVIDER",
  "VIENEU_ENDPOINT",
  "VIENEU_VOICE",
  "VIENEU_API_KEY",
  "OMNIVOICE_ENDPOINT",
  "TTS_CONCURRENCY",
];

describe("loadConfig", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    ENV_KEYS.forEach((k) => delete process.env[k]);
  });

  afterEach(() => {
    Object.entries(saved).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
  });

  it("defaults to vieneu with sensible defaults", () => {
    const cfg = loadConfig();
    expect(cfg.ttsProvider).toBe("vieneu");
    expect(cfg.vieneuEndpoint).toBe("http://127.0.0.1:8000");
    expect(cfg.vieneuVoice).toBeUndefined();
    expect(cfg.vieneuApiKey).toBeUndefined();
    expect(cfg.omnivoiceEndpoint).toBe("http://127.0.0.1:8123");
    expect(cfg.ttsConcurrency).toBe(1);
  });

  it("respects VIENEU_* overrides", () => {
    process.env.VIENEU_ENDPOINT = "http://localhost:9000";
    process.env.VIENEU_VOICE = "Hải Đăng";
    process.env.VIENEU_API_KEY = "k";
    const cfg = loadConfig();
    expect(cfg.vieneuEndpoint).toBe("http://localhost:9000");
    expect(cfg.vieneuVoice).toBe("Hải Đăng");
    expect(cfg.vieneuApiKey).toBe("k");
  });

  it("still accepts omnivoice and its endpoint override", () => {
    process.env.TTS_PROVIDER = "omnivoice";
    process.env.OMNIVOICE_ENDPOINT = "http://localhost:9001";
    const cfg = loadConfig();
    expect(cfg.ttsProvider).toBe("omnivoice");
    expect(cfg.omnivoiceEndpoint).toBe("http://localhost:9001");
  });

  it("rejects unknown providers", () => {
    process.env.TTS_PROVIDER = "elevenlabs";
    expect(() => loadConfig()).toThrow(/TTS_PROVIDER/);
  });
});
