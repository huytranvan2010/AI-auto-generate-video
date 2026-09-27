import "dotenv/config";

export const TTS_PROVIDERS = ["vieneu", "omnivoice"] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];

export interface Config {
    /** Default provider when script.json does not name one. */
    ttsProvider: TtsProvider;

    // VieNeu-TTS (local OpenAI-compatible server: `python -m apps.openai_speech`)
    vieneuEndpoint: string;
    /** Preset voice name; undefined → the server's default voice. */
    vieneuVoice?: string;
    /** Only needed when the server was started with VIENEU_API_KEY. */
    vieneuApiKey?: string;

    // OmniVoice (local TTS server) — model is CC-BY-NC: not for monetized videos
    omnivoiceEndpoint: string;

    ttsConcurrency: number;
}

function intDefault(name: string, def: number): number {
    const v = process.env[name];
    if (!v) return def;
    const n = parseInt(v, 10);
    if (isNaN(n))
        throw new Error(`Env var ${name} must be integer, got "${v}"`);
    return n;
}

export function loadConfig(): Config {
    const provider = (process.env.TTS_PROVIDER ?? "vieneu") as TtsProvider;
    if (!TTS_PROVIDERS.includes(provider)) {
        throw new Error(
            `TTS_PROVIDER must be one of ${TTS_PROVIDERS.join(", ")}, got "${provider}"`,
        );
    }

    return {
        ttsProvider: provider,
        vieneuEndpoint:
            process.env.VIENEU_ENDPOINT ?? "http://127.0.0.1:8000",
        vieneuVoice: process.env.VIENEU_VOICE || undefined,
        vieneuApiKey: process.env.VIENEU_API_KEY || undefined,
        omnivoiceEndpoint:
            process.env.OMNIVOICE_ENDPOINT ?? "http://127.0.0.1:8123",
        ttsConcurrency: intDefault("TTS_CONCURRENCY", 1),
    };
}
