import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { log } from "../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Repo-root/templates — where vendored HyperFrames templates live. */
const TEMPLATES_DIR = join(__dirname, "..", "..", "templates");
/** Fonts HyperFrames fetches for templates stay inside the repo (gitignored). */
const FONT_CACHE_DIR = join(__dirname, "..", "..", ".cache", "hyperframes-fonts");

/**
 * Keep renders local and pinned: no telemetry, no update check / self-upgrade
 * (which would silently replace the pinned version), font cache in the repo.
 */
const HYPERFRAMES_ENV = {
    HYPERFRAMES_NO_TELEMETRY: "1",
    HYPERFRAMES_NO_UPDATE_CHECK: "1",
    HYPERFRAMES_NO_AUTO_INSTALL: "1",
    HYPERFRAMES_FONT_CACHE_DIR: FONT_CACHE_DIR,
};

export type Aspect = "16:9" | "9:16" | "1:1";

/**
 * Absolute path to the HyperFrames CLI installed in this repo's node_modules
 * (pinned exactly in package.json → deterministic renders, no network at
 * render time). Run with the current Node binary, never through a shell, so
 * paths with spaces or Vietnamese characters stay intact.
 */
function hyperframesCli(): string {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("hyperframes/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { bin: string | Record<string, string> };
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin.hyperframes;
    return join(dirname(pkgPath), bin);
}

/**
 * Each aspect renders a dedicated composition file authored at that native
 * canvas (these templates use absolute-px layouts, so we re-lay-out per aspect
 * rather than scale a single composition). Missing file → fall back to index.html.
 */
const ASPECT_ENTRY: Record<Aspect, string> = {
    "16:9": "index.html",
    "9:16": "compositions/portrait.html",
    "1:1": "compositions/square.html",
};

export interface ComposeArgs {
    /** Folder name under templates/, e.g. "frame-bold-poster". */
    templateId: string;
    /** Content slots, matching the template's data-composition-variables schema. */
    inputs: Record<string, unknown>;
    /** Absolute or repo-relative output .mp4 path. */
    outputPath: string;
    /** Force an output aspect. Omit to render the template's native canvas. */
    aspect?: Aspect;
    fps?: number;
    quality?: "draft" | "standard" | "high";
}

/**
 * Render one vendored HyperFrames template into an MP4, injecting `inputs`
 * as composition variables. This is the deterministic "fill the slots" step:
 * the agent only supplies text, the template owns all the visual design.
 */
export async function composeTemplate(args: ComposeArgs): Promise<string> {
    const { templateId, inputs, fps = 30, quality = "standard", aspect } = args;
    const templateDir = join(TEMPLATES_DIR, templateId);
    if (!existsSync(join(templateDir, "index.html"))) {
        throw new Error(`Template not found: ${templateDir}/index.html`);
    }

    // Pick the composition file for the requested aspect (fall back to index.html).
    const entry = aspect ? ASPECT_ENTRY[aspect] : "index.html";
    const entryFile = existsSync(join(templateDir, entry))
        ? entry
        : "index.html";

    const outputPath = isAbsolute(args.outputPath)
        ? args.outputPath
        : resolve(process.cwd(), args.outputPath);

    // Pass variables via a temp file, NOT --variables: a JSON arg on the
    // command line gets mangled on Windows (quotes/Unicode, em-dash, Vietnamese)
    // and the render silently no-ops. A file is UTF-8 clean.
    const varsFile = join(
        mkdtempSync(join(tmpdir(), "hf-vars-")),
        "variables.json",
    );
    writeFileSync(varsFile, JSON.stringify(inputs), "utf8");

    // HyperFrames needs Node ≥ 22; on older Node it dies with a cryptic
    // "util does not provide an export named 'styleText'".
    const nodeMajor = Number(process.versions.node.split(".")[0]);
    if (nodeMajor < 22) {
        throw new Error(`HyperFrames needs Node >= 22, running ${process.version}. Run \`nvm use 22\` first.`);
    }

    const spawnArgs = [
        hyperframesCli(),
        "render",
        templateDir,
        "--composition",
        entryFile,
        "--output",
        outputPath,
        "--fps",
        String(fps),
        "--quality",
        quality,
        "--variables-file",
        varsFile,
    ];

    log.info(`Compose ${templateId} (${entryFile}) → ${outputPath}`);

    await new Promise<void>((resolve, reject) => {
        const proc = spawn(process.execPath, spawnArgs, {
            stdio: ["ignore", "inherit", "inherit"],
            env: { ...process.env, ...HYPERFRAMES_ENV },
        });
        proc.on("close", (code) =>
            code === 0
                ? resolve()
                : reject(new Error(`hyperframes render failed (exit ${code})`)),
        );
        proc.on("error", reject);
    });

    log.info(`Rendered: ${outputPath}`);
    return outputPath;
}

/** POC entry: `tsx src/render/template-composer.ts` renders sample clips. */
// pathToFileURL handles Windows backslash paths (a raw `file://${argv[1]}`
// never matches import.meta.url on win32, silently skipping this block).
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    const inputs = {
        kicker: "TechLetsGo",
        date: "12 · 06 · 2026",
        figure: "5.5",
        headline: ["GPT 5.5", "ra mắt.", "Mạnh nhất."],
        standfirst:
            "OpenAI vừa công bố mô hình mạnh nhất từ trước tới nay — nhanh hơn, rẻ hơn, hiểu tiếng Việt tốt hơn.",
        footer_left: "TechLetsGo",
        footer_right: "Bản tin",
    };
    (async () => {
        await composeTemplate({
            templateId: "frame-bold-poster",
            inputs,
            aspect: "16:9",
            outputPath: "output/poc-bold-poster-16x9.mp4",
        });
        await composeTemplate({
            templateId: "frame-bold-poster",
            inputs,
            aspect: "9:16",
            outputPath: "output/poc-bold-poster-9x16.mp4",
        });
    })().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
