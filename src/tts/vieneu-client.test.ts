import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { VieneuClient, VIENEU_SAMPLE_RATE } from "./vieneu-client.js";
import { getDurationSec } from "../assets/audio-tools.js";

const ENDPOINT = "http://127.0.0.1:8000";

/** `sec` seconds of a 440 Hz tone as s16le mono PCM at the VieNeu rate. */
function tonePcm(sec: number): Buffer {
  const n = Math.round(sec * VIENEU_SAMPLE_RATE);
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / VIENEU_SAMPLE_RATE)), i * 2);
  }
  return buf;
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vieneu-"));
  nock.disableNetConnect();
});
afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
  rmSync(tmp, { recursive: true, force: true });
});

describe("VieneuClient", () => {
  it("requests PCM with the given voice and writes an mp3 of the right length", async () => {
    let body: any;
    nock(ENDPOINT)
      .post("/v1/audio/speech", (b) => ((body = b), true))
      .reply(200, tonePcm(2));

    const out = join(tmp, "scene.mp3");
    await new VieneuClient({ endpoint: ENDPOINT }).generate("Xin chào", out, undefined, { voice: "Hải Đăng" });

    expect(body).toMatchObject({ input: "Xin chào", voice: "Hải Đăng", response_format: "pcm", sample_rate: 48000 });
    expect(existsSync(out)).toBe(true);
    const d = await getDurationSec(out);
    expect(d).toBeGreaterThan(1.9);
    expect(d).toBeLessThan(2.15);
  });

  it("falls back to defaultVoice and sends the API key", async () => {
    let body: any;
    nock(ENDPOINT, { reqheaders: { authorization: "Bearer secret" } })
      .post("/v1/audio/speech", (b) => ((body = b), true))
      .reply(200, tonePcm(0.5));

    const client = new VieneuClient({ endpoint: ENDPOINT, defaultVoice: "Minh Đức", apiKey: "secret" });
    await client.generate("Chào", join(tmp, "a.wav"));
    expect(body.voice).toBe("Minh Đức");
  });

  it("omits voice when none is configured (server default)", async () => {
    let body: any;
    nock(ENDPOINT).post("/v1/audio/speech", (b) => ((body = b), true)).reply(200, tonePcm(0.5));
    await new VieneuClient({ endpoint: ENDPOINT }).generate("Chào", join(tmp, "a.wav"));
    expect(body).not.toHaveProperty("voice");
  });

  it("applies speed locally with atempo", async () => {
    nock(ENDPOINT).post("/v1/audio/speech").reply(200, tonePcm(2));
    const out = join(tmp, "fast.wav");
    await new VieneuClient({ endpoint: ENDPOINT }).generate("Nhanh", out, undefined, { speed: 1.25 });
    const d = await getDurationSec(out);
    expect(d).toBeGreaterThan(1.55);
    expect(d).toBeLessThan(1.65);
  });

  it("surfaces 4xx errors with the server message and does not retry", async () => {
    const scope = nock(ENDPOINT)
      .post("/v1/audio/speech")
      .once()
      .reply(400, { error: { message: "unknown voice 'Ai Đó'; see GET /v1/voices" } });

    await expect(
      new VieneuClient({ endpoint: ENDPOINT, retryDelaysMs: [0, 0] }).generate("x", join(tmp, "x.mp3"), undefined, {
        voice: "Ai Đó",
      }),
    ).rejects.toThrow(/status 400.*unknown voice 'Ai Đó'/);
    expect(scope.isDone()).toBe(true);
  });

  it("retries 5xx/429 then succeeds", async () => {
    nock(ENDPOINT)
      .post("/v1/audio/speech").reply(503, "busy")
      .post("/v1/audio/speech").reply(429, "queue full")
      .post("/v1/audio/speech").reply(200, tonePcm(0.5));

    const out = join(tmp, "retry.wav");
    await new VieneuClient({ endpoint: ENDPOINT, retryDelaysMs: [0, 0, 0] }).generate("x", out);
    expect(existsSync(out)).toBe(true);
  });

  it("explains how to start the server when nothing is listening", async () => {
    nock.enableNetConnect("127.0.0.1:1");
    await expect(
      new VieneuClient({ endpoint: "http://127.0.0.1:1", retryDelaysMs: [] }).generate("x", join(tmp, "x.mp3")),
    ).rejects.toThrow(/apps\.openai_speech/);
  });
});
