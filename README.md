<a id="top"></a>

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-white.svg" />
  <img src="./assets/logo.svg" alt="TechLetsGo — English &amp; Technology &amp; AI" width="320" />
</picture>

<h1>TechLetsGo&nbsp;·&nbsp;Template&nbsp;Video</h1>

<p><b>A Vietnamese article in. A 9:16 short out.</b><br/>
One command · zero editing · deterministic renders.</p>

<p>
<img alt="Node" src="https://img.shields.io/badge/Node-%E2%89%A522-339933?style=flat-square&logo=node.js&logoColor=white" />
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" />
<img alt="HyperFrames" src="https://img.shields.io/badge/HyperFrames-0.6.94-ec4899?style=flat-square" />
<img alt="VieNeu-TTS" src="https://img.shields.io/badge/TTS-VieNeu--TTS-f59e0b?style=flat-square" />
<img alt="Format" src="https://img.shields.io/badge/9%3A16-1080%C3%971920-0ea5e9?style=flat-square" />
<img alt="License" src="https://img.shields.io/badge/License-MIT-10b981?style=flat-square" />
</p>

<p><b>🌐 English</b> · <a href="README.vi.md">Tiếng Việt</a></p>

<sub>
<a href="#-quick-start"><b>Quick Start</b></a> ·
<a href="#-how-it-works"><b>How It Works</b></a> ·
<a href="#-usage"><b>Usage</b></a> ·
<a href="#-templates"><b>Templates</b></a>
</sub>

</div>

---

<div align="center">
<img src="./assets/pipeline.svg" alt="url / .txt → Claude Code (/create-template-video) → pipeline (VieNeu-TTS · SFX · HyperFrames · FFmpeg) → video.mp4 + voice.mp3 + script.txt" width="860" />
</div>

> **The split that makes it reliable:** AI handles _content_ (the script + template choices),
> deterministic code handles _production_ (the pixels). The same `script.json` always renders the
> same video — no surprises, no manual editing.

You supply the **text**. The templates own all the design, layout, and motion. The pipeline does
TTS, sound design, rendering, and the final mux — and hands you three files ready for
CapCut / TikTok / Shorts / Reels:

| File         | What it's for                              |
| ------------ | ------------------------------------------ |
| `video.mp4`  | Final 9:16 video with voice + SFX baked in |
| `voice.mp3`  | Narration track — drop into CapCut         |
| `script.txt` | Plain text — CapCut auto-caption           |

---

## 🚀 Quick Start

```bash
git clone <repo-url> techletsgo-template-video
cd techletsgo-template-video
npm install
# start your local VieNeu-TTS server (see Configuration), then generate video
```

<table>
<tr>
<td valign="top" width="50%">

**With Claude Code** — _recommended_

```text
/create-template-video https://example.com/some-article
```

Claude fetches the article, writes `script.json`, and runs the pipeline for you.

</td>
<td valign="top" width="50%">

**Manual** — _bring your own `script.json`_

```bash
npm run pipeline -- output/my-video/script.json
```

Full control over every scene and template.

</td>
</tr>
</table>

A few minutes later → `output/<slug>/video.mp4` (1080×1920).

**Note**: The `.agent` directory has been added, so all these instructions work not only with Claude Code but can also work with other Coding Assistants, since everything here is a skill.

---

## 🧠 How It Works

```mermaid
flowchart LR
    A["📰 URL / .txt"] -->|/create-template-video| B[Claude Code]
    B -->|fetch + write text| C["script.json<br/>renderer: hyperframes"]
    C -->|Zod validate| D[Template Pipeline]
    D -->|TTS per scene| E[VieNeu-TTS]
    E -->|concat + SFX mix| F[voice.mp3]
    D -->|render each template| G["HyperFrames<br/>Chromium"]
    G -->|fit clip to narration| H["clips/scene-*.mp4"]
    F --> I[mux audio]
    H --> I
    I -->|🎬| J["video.mp4<br/>1080×1920"]

    style A fill:#0f172a,color:#fff,stroke:#334155
    style B fill:#6366f1,color:#fff,stroke:#6366f1
    style E fill:#f59e0b,color:#fff,stroke:#f59e0b
    style G fill:#ec4899,color:#fff,stroke:#ec4899
    style J fill:#10b981,color:#fff,stroke:#10b981
```

Eight deterministic steps in [`src/render/template-pipeline.ts`](src/render/template-pipeline.ts):

| #   | Step             | Output                                                        |
| --- | ---------------- | ------------------------------------------------------------- |
| 1   | **Validate**     | `script.json` checked against the Zod schema                  |
| 2   | **Caption text** | `script.txt` — all `voiceText` joined (CapCut auto-caption)   |
| 3   | **TTS / scene**  | `voice/scene-<id>.mp3` via VieNeu-TTS _(idempotent)_          |
| 4   | **Concat voice** | `voice-raw.mp3` with 0.3s gaps + per-scene start times        |
| 5   | **SFX mix**      | `voice.mp3` — sound effects layered onto the narration        |
| 6   | **Render clips** | `clips/scene-<id>-fit.mp4` — template → MP4, fit to narration |
| 7   | **Concat + mux** | `video-silent.mp4` → `video.mp4` (voice muxed in)             |
| 8   | **Done**         | prints result paths + total duration                          |

---

## ⚡ Setup

<details open>
<summary><b>Prerequisites</b></summary>

<br/>

| Item                  | Need       | Notes                                                               |
| --------------------- | ---------- | ------------------------------------------------------------------- |
| **Node.js**           | ≥ 22       | `node --version`                                                    |
| **FFmpeg + ffprobe**  | any modern | must be in PATH (`ffmpeg -version`)                                 |
| **Chrome / Chromium** | any        | used by HyperFrames to render each template                         |
| **VieNeu-TTS server** | running    | local TTS at `VIENEU_ENDPOINT` (default `http://127.0.0.1:8000`)    |
| **Claude Code CLI**   | optional   | only for the `/create-template-video` skill                         |

**Install FFmpeg:**

- **Windows** — `winget install Gyan.FFmpeg`
- **macOS** — `brew install ffmpeg`
- **Linux** — `sudo apt install ffmpeg`

</details>

<details open>
<summary><b>Configuration</b> — <code>.env.local</code></summary>

<br/>

The default TTS is [VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS), running locally — **no API keys.** Its model and preset voices are Apache-2.0 and the generated audio may be used in monetized videos.

Start its OpenAI-compatible API server from the VieNeu-TTS repo:

```bash
HOST=127.0.0.1 uv run python -m apps.openai_speech   # → http://127.0.0.1:8000
```

```env
TTS_PROVIDER=vieneu
VIENEU_ENDPOINT=http://127.0.0.1:8000
VIENEU_VOICE=Hải Đăng        # optional; empty = server default voice
# VIENEU_API_KEY=...         # only if the server sets VIENEU_API_KEY
```

List voices with `curl http://127.0.0.1:8000/v1/voices`; `voice.voice` in `script.json` overrides `VIENEU_VOICE`. The server ignores `speed`, so the rate is applied with FFmpeg `atempo`.

> OmniVoice still works (`"provider": "omnivoice"`, `OMNIVOICE_ENDPOINT`), but its model is **CC-BY-NC** — not for monetized videos.

</details>

---

## 🎬 Usage

**Inside Claude Code** _(recommended)_ — pass a URL or a local `.txt`:

```text
/create-template-video https://example.com/iphone-17-200mp
/create-template-video news/my-article.txt
```

The skill reads the content, writes `script.json`, and runs the pipeline. Authoring rules
(template mapping + Vietnamese TTS number handling) live in the
[skill spec](.claude/skills/create-template-video/SKILL.md).

**Or run the pipeline directly** on an existing `script.json`:

```bash
npm run pipeline -- output/<slug>/script.json
```

<details>
<summary><b>📄 <code>script.json</code> shape</b> (template mode)</summary>

<br/>

```json
{
    "version": "1.0",
    "renderer": "hyperframes",
    "aspect": "9:16",
    "metadata": {
        "title": "Apple ra mắt iPhone 17 camera 200MP",
        "source": {
            "url": "https://...",
            "domain": "example.com",
            "image": null
        },
        "channel": "TechLetsGo"
    },
    "voice": { "provider": "vieneu", "voice": "Hải Đăng", "speed": 1.0 },
    "scenes": [
        {
            "id": "hook",
            "type": "hook",
            "voiceText": "Apple vừa ra mắt iPhone mười bảy với camera hai trăm megapixel.",
            "templateId": "frame-liquid-bg-hero",
            "inputs": {
                "kicker": "🔥 Tin nóng",
                "headline": "iPhone 17",
                "subheadline": "Camera 200MP",
                "cta": "Theo dõi ngay",
                "brand": "TechLetsGo"
            }
        },
        {
            "id": "body-1",
            "type": "body",
            "voiceText": "Cảm biến mới thu nhiều ánh sáng hơn, ảnh đêm sắc nét hơn rõ rệt.",
            "templateId": "frame-pentagram-stat",
            "inputs": {
                "label": "Camera",
                "headline": "200MP",
                "subtitle": "Cảm biến lớn nhất từ trước tới nay",
                "anchor": "200"
            }
        },
        {
            "id": "outro",
            "type": "outro",
            "voiceText": "Theo dõi TechLetsGo để học tiếng Anh, công nghệ và AI mỗi ngày.",
            "templateId": "frame-logo-outro",
            "inputs": {
                "brand_name": "TechLetsGo",
                "tagline": "Học tiếng Anh, công nghệ và AI mỗi ngày",
                "primary_url": ""
            }
        }
    ]
}
```

Schema rules: **3–12 scenes** · `scenes[0].type === "hook"` · last scene `type === "outro"` ·
every `templateId` must exist under `templates/`.

</details>

<details>
<summary><b>📁 Output structure</b></summary>

<br/>

```
output/<slug>-<timestamp>/
├── script.json          # input (skill-generated or hand-written)
├── script.txt           # all voiceText joined — CapCut auto-caption
├── voice/
│   ├── scene-hook.mp3    # TTS per scene (idempotent)
│   └── scene-*.mp3
├── voice-raw.mp3        # concatenated voices, no SFX (intermediate)
├── voice.mp3           # final audio with SFX mixed in
├── clips/
│   ├── scene-hook.mp4     # rendered template clip (idempotent)
│   └── scene-hook-fit.mp4 # fitted to the scene's narration length
├── video-silent.mp4    # concatenated clips, no audio (intermediate)
└── video.mp4          # 🎉 final — 1080×1920 + voice + SFX
```

> **Idempotent.** Delete `voice/scene-<id>.mp3` to force re-TTS, or `clips/scene-<id>.mp4` to
> re-render just that scene, then re-run the pipeline.

</details>

---

## 🎨 Templates

Every visual is a self-contained **HyperFrames** project under `templates/` — `index.html` (16:9)
and `compositions/portrait.html` (9:16). You fill the text `inputs`; the template owns the design.
Full slot reference: [`templates/CATALOG.md`](templates/CATALOG.md).

| Template                    | Role  | Best for                                                  |
| --------------------------- | :---: | --------------------------------------------------------- |
| `frame-liquid-bg-hero`      | hook  | Opening hook — aurora hero with headline + CTA pill       |
| `frame-vignelli`            | body  | A single striking stat — dark charcoal + red accent       |
| `frame-pentagram-stat`      | body  | A hero number / benchmark — dark neon + bar chart         |
| `frame-bold-poster`         | body  | A punchy multi-line statement + giant figure              |
| `frame-build-minimal`       | body  | One bold word revealed letter-by-letter — dark/amber      |
| `frame-creative-voltage`    | body  | A creative slogan — electric-blue split + handwriting     |
| `frame-glitch-title`        | body  | Breaking / tech news — cyberpunk RGB-split glitch         |
| `frame-list`                | body  | A **list** of 2–5 items (icon + level tag)                |
| `frame-comparison`          | body  | A **head-to-head** comparison of two things               |
| `frame-logo-outro`          | outro | Default brand end-card — logo glow + name + tagline + URL |
| `frame-statement-outro`     | outro | Alternative outro — red statement card on paper           |

> **Add your own:** drop `templates/<id>/` with `index.html`, `compositions/portrait.html`,
> `hyperframes.json`, `meta.json` (+ `NOTICE.md` if vendored), then add a row to `CATALOG.md`.
> Use a Vietnamese-capable font stack.

---

## 🔊 Sound Effects

SFX live in `assets/sfx/<category>/<name>.mp3`. Per scene, the picker
([`src/assets/sfx-selector.ts`](src/assets/sfx-selector.ts)) resolves in three tiers:

```
1. scene.sfx override   → exact file, or { "name": "none" } to mute
2. semantic match        → voiceText keywords (cảnh báo→alert, kỷ lục→success, ra mắt→reveal …)
3. scene-type default    → hook→hook · body→callout · outro→outro
```

Within a category the file is chosen **deterministically** by hashing the scene id — same script
gives the same SFX, different scenes get different files. The library is large and **not
committed**:

```bash
npm run sfx:download   # fetch the SFX library
npm run sfx:filter     # prune / filter it
```

No `assets/sfx/`? The pipeline just renders without SFX.

---

## 🛠️ Built With

| Layer             | Technology                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------- |
| **Runtime**       | Node ≥22 · TypeScript 6 · ESM · [tsx](https://github.com/privatenumber/tsx)               |
| **Render**        | [HyperFrames](https://www.npmjs.com/package/hyperframes) `0.6.94` (HTML→MP4 via Chromium) |
| **TTS**           | VieNeu-TTS (local, Apache-2.0) · OmniVoice optional (CC-BY-NC)                            |
| **Schema**        | [Zod](https://zod.dev) ^4                                                                 |
| **HTTP**          | axios + [nock](https://github.com/nock/nock)                                              |
| **Concurrency**   | [p-limit](https://github.com/sindresorhus/p-limit)                                        |
| **A/V**           | FFmpeg + ffprobe                                                                          |
| **Tests**         | [Vitest](https://vitest.dev) ^4                                                           |
| **Orchestration** | [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) skill                 |

---

## 🙏 Acknowledgements

- [HyperFrames](https://www.npmjs.com/package/hyperframes) — the HTML-to-video engine behind the templates
- [VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS) — local Vietnamese text-to-speech (Apache-2.0)
- [OmniVoice](https://github.com/k2-fsa/OmniVoice) — optional TTS (CC-BY-NC model)
- [html-video](https://github.com/nexu-io/html-video) — HTML-to-video approach this project builds on
- [Auto-Create-Video](https://github.com/hoquanghai/Auto-Create-Video) — the original project this is based on
- [AI-auto-generate-video](https://github.com/huytranvan2010/AI-auto-generate-video) — the repo this project is forked from (MIT © AI Coding)

---

## 💖 Support this project

If this project saved you time, please consider:

- ⭐ **Star this repo** — it really helps with discoverability
- 💬 Tell a friend who creates content
- 🐛 Report bugs or request features

---

<div align="center">

<br/>

**[⬆ Back to top](#top)**

<sub>Made with ❤️ by <b>TechLetsGo</b> · English &amp; Technology &amp; AI</sub>

</div>
