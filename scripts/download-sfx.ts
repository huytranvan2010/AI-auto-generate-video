import axios from "axios";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

// ── Default category config ────────────────────────────────────────────────
// Edit this OR pass --config <path-to-json> to override.
const DEFAULT_CONFIG: Record<string, string[]> = {
    transition: [
        "whoosh",
        "swoosh",
        "swish",
        "pop",
        "click",
        "page-flip",
        "slide",
    ],
    emphasis: ["ding", "tick", "chime", "bell", "pop", "ping"],
    alert: ["notification", "alert", "warning", "alarm"],
    success: ["tada", "win", "achievement", "level-up", "success", "victory"],
    fail: ["wrong", "buzzer", "error", "wrong-answer", "fail"],
    drumroll: ["drumroll", "drum-roll", "snare", "boom"],
    applause: ["applause", "clap", "cheering"],
    laugh: ["laugh", "haha"],
    countdown: ["countdown", "beep", "timer"],
    cinematic: ["cinematic", "epic", "rise", "impact"],
    reveal: ["reveal", "bling", "magic", "sparkle"],
    outro: ["tada", "outro", "ending", "finale"],
};

// ── CLI parsing ────────────────────────────────────────────────────────────
function parseArgs(): { target: string; max: number; configPath?: string } {
    const args = process.argv.slice(2);
    let target = join(PROJECT_ROOT, "SFX");
    let max = 5;
    let configPath: string | undefined;

    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--target" && args[i + 1]) {
            target = args[++i];
            continue;
        }
        if (a === "--max" && args[i + 1]) {
            max = parseInt(args[++i], 10);
            continue;
        }
        if (a === "--config" && args[i + 1]) {
            configPath = args[++i];
            continue;
        }
        if (a === "--help" || a === "-h") {
            console.log(
                "Usage: npx tsx scripts/download-sfx.ts [--target DIR] [--max N] [--config FILE]",
            );
            process.exit(0);
        }
    }
    return { target, max, configPath };
}

function loadConfig(configPath?: string): Record<string, string[]> {
    if (!configPath) return DEFAULT_CONFIG;
    const raw = readFileSync(configPath, "utf8");
    return JSON.parse(raw);
}

// ── myinstants search + extract ────────────────────────────────────────────
async function searchMyInstants(query: string, max: number): Promise<string[]> {
    const url = `https://www.myinstants.com/en/search/?name=${encodeURIComponent(query)}`;
    const resp = await axios.get<string>(url, {
        timeout: 20000,
        headers: {
            "User-Agent": "Mozilla/5.0 (techletsgo-template-video SFX downloader)",
        },
        validateStatus: () => true,
    });
    if (resp.status !== 200) {
        console.warn(`  [WARN] search "${query}" returned HTTP ${resp.status}`);
        return [];
    }
    // Extract media/sounds/<filename>.mp3 — dedupe + cap at max
    const matches =
        resp.data.match(/media\/sounds\/[A-Za-z0-9_\-.]+\.mp3/g) ?? [];
    const unique = Array.from(new Set(matches));
    return unique.slice(0, max);
}

async function downloadOne(
    relUrl: string,
    outPath: string,
): Promise<"downloaded" | "skipped" | "failed"> {
    // Skip if file already exists
    try {
        await access(outPath);
        return "skipped";
    } catch {
        /* not exists, continue */
    }

    const url = `https://www.myinstants.com/${relUrl}`;
    try {
        const resp = await axios.get<ArrayBuffer>(url, {
            responseType: "arraybuffer",
            timeout: 30000,
            headers: {
                "User-Agent": "Mozilla/5.0 (techletsgo-template-video SFX downloader)",
            },
        });
        if (resp.status !== 200) return "failed";
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, Buffer.from(resp.data));
        return "downloaded";
    } catch (e: any) {
        console.warn(`  [WARN] download failed for ${relUrl}: ${e.message}`);
        return "failed";
    }
}

function relUrlToFilename(relUrl: string): string {
    // "media/sounds/whoosh-sfx.mp3" → "whoosh-sfx.mp3"
    return relUrl.split("/").pop()!;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
    const { target, max, configPath } = parseArgs();
    const config = loadConfig(configPath);

    console.log(`Target dir : ${target}`);
    console.log(`Max per query: ${max}`);
    console.log(`Categories : ${Object.keys(config).length}`);
    console.log(
        `Total queries: ${Object.values(config).reduce((s, q) => s + q.length, 0)}`,
    );
    console.log("");

    const summary = { downloaded: 0, skipped: 0, failed: 0, queries: 0 };

    for (const [category, queries] of Object.entries(config)) {
        const catDir = join(target, category);
        await mkdir(catDir, { recursive: true });
        console.log(`\n=== ${category} ===`);

        for (const query of queries) {
            summary.queries++;
            console.log(`  query: "${query}"`);
            const urls = await searchMyInstants(query, max);
            if (urls.length === 0) {
                console.log(`    (no results)`);
                continue;
            }
            for (const relUrl of urls) {
                const filename = relUrlToFilename(relUrl);
                const outPath = join(catDir, filename);
                const result = await downloadOne(relUrl, outPath);
                const sym =
                    result === "downloaded"
                        ? "✓"
                        : result === "skipped"
                          ? "·"
                          : "✗";
                console.log(`    ${sym} ${filename}`);
                summary[result]++;
                // Tiny politeness delay
                await new Promise((r) => setTimeout(r, 100));
            }
        }
    }

    console.log("\n========================================");
    console.log(`Done. Queries: ${summary.queries}`);
    console.log(`Downloaded:  ${summary.downloaded}`);
    console.log(`Skipped:     ${summary.skipped}  (already on disk)`);
    console.log(`Failed:      ${summary.failed}`);
    console.log(`\nLibrary at: ${target}`);
}

main().catch((e) => {
    console.error("Downloader failed:", e);
    process.exit(1);
});
