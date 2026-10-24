#!/bin/sh
# ashell-omnivoice-pipeline.sh
#
# a-Shell client cho OmniVoice-compatible HTTP server.
# a-Shell KHÔNG chạy model OmniVoice local; script này gửi voiceText qua HTTP.
# Server phải nhận JSON {"text":"..."} và trả bytes audio/mpeg.
#
# Luồng:
#   script.json
#       -> trích voiceText từng scene
#       -> POST tới OMNIVOICE_ENDPOINT/tts
#       -> voice/scene-*.mp3
#       -> ghép voice.mp3 bằng FFmpeg, chèn gap 0.3s
#       -> tạo subtitles.srt theo từng scene
#       -> gọi ashell-video-pipeline.sh
#
# Cấu trúc project:
#   project/
#   ├── script.json
#   ├── clips/clip-01.mp4 ...
#   ├── music.mp3                  # tùy chọn
#   └── ashell-video-pipeline.sh   # script FFmpeg trước đó
#
# Cách dùng:
#   sh ashell-omnivoice-pipeline.sh project script.json \
#     --endpoint http://192.168.1.10:8123 \
#     --pipeline ./ashell-video-pipeline.sh \
#     --music project/music.mp3
#
# Contract endpoint:
#   POST <endpoint>/tts
#   Content-Type: application/json
#   Body: {"text":"Nội dung tiếng Việt"}
#   Response: audio/mpeg bytes (MP3/WAV bytes đều được FFmpeg đọc)

set -eu

PROJECT=""
SCRIPT_JSON=""
ENDPOINT=""
PIPELINE=""
MUSIC=""
OUTPUT=""
GAP_SEC="0.30"
MUSIC_VOLUME="0.12"
WIDTH="1080"
HEIGHT="1920"
FPS="30"
KEEP_TEMP="0"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Thiếu lệnh '$1'."
}

usage() {
  sed -n '1,45p' "$0"
}

[ "$#" -gt 0 ] || { usage; exit 2; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --endpoint)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --endpoint."
      ENDPOINT=$2
      shift 2
      ;;
    --pipeline)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --pipeline."
      PIPELINE=$2
      shift 2
      ;;
    --music)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --music."
      MUSIC=$2
      shift 2
      ;;
    --output)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --output."
      OUTPUT=$2
      shift 2
      ;;
    --gap)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --gap."
      GAP_SEC=$2
      shift 2
      ;;
    --music-volume)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --music-volume."
      MUSIC_VOLUME=$2
      shift 2
      ;;
    --width)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --width."
      WIDTH=$2
      shift 2
      ;;
    --height)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --height."
      HEIGHT=$2
      shift 2
      ;;
    --fps)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --fps."
      FPS=$2
      shift 2
      ;;
    --keep-temp)
      KEEP_TEMP=1
      shift
      ;;
    -* )
      fail "Tùy chọn không hợp lệ: $1"
      ;;
    * )
      if [ -z "$PROJECT" ]; then
        PROJECT=$1
      elif [ -z "$SCRIPT_JSON" ]; then
        SCRIPT_JSON=$1
      else
        fail "Chỉ truyền PROJECT_DIR và SCRIPT_JSON."
      fi
      shift
      ;;
  esac
done

[ -n "$PROJECT" ] || fail "Thiếu PROJECT_DIR."
[ -n "$SCRIPT_JSON" ] || SCRIPT_JSON="$PROJECT/script.json"
[ -n "$ENDPOINT" ] || fail "Thiếu --endpoint, ví dụ http://192.168.1.10:8123"
[ -n "$PIPELINE" ] || PIPELINE="$(dirname "$0")/ashell-video-pipeline.sh"
[ -n "$OUTPUT" ] || OUTPUT="$PROJECT/output.mp4"

need_cmd curl
need_cmd ffmpeg
need_cmd ffprobe
need_cmd python3
need_cmd awk
need_cmd sed
need_cmd sort

[ -d "$PROJECT" ] || fail "Không tìm thấy project: $PROJECT"
[ -f "$SCRIPT_JSON" ] || fail "Không tìm thấy script.json: $SCRIPT_JSON"
[ -f "$PIPELINE" ] || fail "Không tìm thấy FFmpeg pipeline: $PIPELINE"

ENDPOINT=${ENDPOINT%/}
TTS_URL="$ENDPOINT/tts"
WORK="$PROJECT/.ashell-omnivoice-tmp-$$"
VOICE_DIR="$PROJECT/voice"
mkdir -p "$WORK/requests" "$VOICE_DIR"

cleanup() {
  status=$?
  if [ "$KEEP_TEMP" -eq 1 ]; then
    echo "Giữ file trung gian tại: $WORK"
  else
    rm -rf "$WORK"
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM

# Python được dùng chỉ để parse JSON và escape Unicode an toàn.
cat > "$WORK/json_tool.py" <<'PY'
import json
import sys
from pathlib import Path

mode = sys.argv[1]

if mode == "manifest":
    path = Path(sys.argv[2])
    data = json.loads(path.read_text(encoding="utf-8"))
    out = Path(sys.argv[3])
    scenes = data.get("scenes", [])
    if not scenes:
        raise SystemExit("script.json không có scenes")
    if scenes[0].get("type") != "hook":
        raise SystemExit("scene đầu tiên phải có type=hook")
    if scenes[-1].get("type") != "outro":
        raise SystemExit("scene cuối cùng phải có type=outro")
    if len(scenes) < 3 or len(scenes) > 12:
        raise SystemExit("scenes phải nằm trong khoảng 3-12")
    with out.open("w", encoding="utf-8") as f:
        for index, scene in enumerate(scenes, 1):
            scene_id = str(scene.get("id", "")).strip()
            text = str(scene.get("voiceText", "")).strip()
            if not scene_id or not text:
                raise SystemExit(f"scene {index} thiếu id hoặc voiceText")
            # Tên file chỉ dùng ký tự an toàn.
            safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in scene_id)
            request_path = out.parent / "requests" / f"{index:03d}-{safe}.json"
            request_path.write_text(json.dumps({"text": text}, ensure_ascii=False), encoding="utf-8")
            f.write(f"{index}\t{safe}\t{request_path}\n")

elif mode == "srt":
    # argv: srt manifest durations output gap
    manifest = Path(sys.argv[2])
    durations = Path(sys.argv[3])
    output = Path(sys.argv[4])
    gap = float(sys.argv[5])
    dur_map = {}
    for line in durations.read_text(encoding="utf-8").splitlines():
        if line.strip():
            index, seconds = line.split("\t", 1)
            dur_map[int(index)] = float(seconds)

    def stamp(seconds):
        ms = int(round(seconds * 1000))
        h, ms = divmod(ms, 3600000)
        m, ms = divmod(ms, 60000)
        s, ms = divmod(ms, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    blocks = []
    cursor = 0.0
    for line in manifest.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        index, safe, request_path = line.split("\t", 2)
        request = json.loads(Path(request_path).read_text(encoding="utf-8"))
        duration = dur_map[int(index)]
        start = cursor
        end = cursor + duration
        blocks.append(f"{index}\n{stamp(start)} --> {stamp(end)}\n{request['text']}\n")
        cursor = end + gap
    output.write_text("\n".join(blocks), encoding="utf-8")
PY

MANIFEST="$WORK/manifest.tsv"
DURATIONS="$WORK/durations.tsv"
python3 "$WORK/json_tool.py" manifest "$SCRIPT_JSON" "$MANIFEST" || fail "script.json không hợp lệ."

SCENE_COUNT=$(wc -l < "$MANIFEST" | tr -d ' ')
[ "$SCENE_COUNT" -ge 3 ] || fail "Cần tối thiểu 3 scene."

echo "== a-Shell OmniVoice -> FFmpeg pipeline =="
echo "Project:  $PROJECT"
echo "Script:   $SCRIPT_JSON"
echo "Endpoint: $TTS_URL"
echo "Scenes:   $SCENE_COUNT"
echo

# Endpoint health là tùy chọn; không fail nếu server không có /health.
if curl -fsS --max-time 8 "$ENDPOINT/health" >/dev/null 2>&1; then
  echo "OmniVoice health: PASS"
else
  echo "OmniVoice health: không có hoặc không phản hồi; tiếp tục thử /tts"
fi

echo "[1/4] Gọi OmniVoice cho từng scene..."
: > "$WORK/audio-list.txt"
: > "$DURATIONS"

while IFS="$(printf '\t')" read -r INDEX SAFE REQUEST_JSON; do
  [ -n "$INDEX" ] || continue
  AUDIO="$VOICE_DIR/scene-${SAFE}.mp3"
  echo "  - scene $INDEX: $SAFE"

  # Cache theo scene ID: xóa file nếu voiceText đã thay đổi.
  if [ ! -s "$AUDIO" ]; then
    curl -fsS --retry 2 --retry-delay 2 --max-time 600 \
      -H 'Content-Type: application/json' \
      --data-binary "@$REQUEST_JSON" \
      "$TTS_URL" \
      -o "$AUDIO" \
      || fail "OmniVoice lỗi ở scene $SAFE"
  else
    echo "    cache hit: $AUDIO"
  fi

  [ -s "$AUDIO" ] || fail "Audio rỗng: $AUDIO"
  DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO" 2>/dev/null | tr -d '\r')
  [ -n "$DURATION" ] || fail "Không đọc được duration: $AUDIO"
  printf '%s\t%s\n' "$INDEX" "$DURATION" >> "$DURATIONS"
  printf "file '%s'\n" "$AUDIO" >> "$WORK/audio-list.txt"

  # Silence giữa hai scene. Dùng WAV/MP3 ngắn để concat ổn định trên a-Shell.
  if [ "$INDEX" -lt "$SCENE_COUNT" ]; then
    SILENCE="$WORK/silence-${INDEX}.mp3"
    ffmpeg -nostdin -hide_banner -loglevel error -y \
      -f lavfi -i "anullsrc=r=24000:cl=mono" \
      -t "$GAP_SEC" \
      -c:a libmp3lame -b:a 128k "$SILENCE" \
      || fail "Không tạo được silence gap."
    printf "file '%s'\n" "$SILENCE" >> "$WORK/audio-list.txt"
  fi
done < "$MANIFEST"

echo "[2/4] Ghép voice.mp3 và tạo subtitles.srt..."
VOICE_OUT="$PROJECT/voice.mp3"
ffmpeg -nostdin -hide_banner -loglevel error -y \
  -f concat -safe 0 -i "$WORK/audio-list.txt" \
  -ar 24000 -ac 1 -c:a libmp3lame -b:a 192k "$VOICE_OUT" \
  || fail "Không ghép được voice.mp3."

SUBTITLES="$PROJECT/subtitles.srt"
python3 "$WORK/json_tool.py" srt "$MANIFEST" "$DURATIONS" "$SUBTITLES" "$GAP_SEC" \
  || fail "Không tạo được subtitles.srt."

VOICE_DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VOICE_OUT" | tr -d '\r')
echo "  voice: $VOICE_OUT (${VOICE_DURATION}s)"
echo "  srt:   $SUBTITLES"

echo "[3/4] Gọi pipeline FFmpeg video..."
if [ -n "$MUSIC" ] && [ "$KEEP_TEMP" -eq 1 ]; then
  sh "$PIPELINE" "$PROJECT" --voice "$VOICE_OUT" --subtitles "$SUBTITLES" \
    --output "$OUTPUT" --width "$WIDTH" --height "$HEIGHT" --fps "$FPS" \
    --music "$MUSIC" --music-volume "$MUSIC_VOLUME" --keep-temp
elif [ -n "$MUSIC" ]; then
  sh "$PIPELINE" "$PROJECT" --voice "$VOICE_OUT" --subtitles "$SUBTITLES" \
    --output "$OUTPUT" --width "$WIDTH" --height "$HEIGHT" --fps "$FPS" \
    --music "$MUSIC" --music-volume "$MUSIC_VOLUME"
elif [ "$KEEP_TEMP" -eq 1 ]; then
  sh "$PIPELINE" "$PROJECT" --voice "$VOICE_OUT" --subtitles "$SUBTITLES" \
    --output "$OUTPUT" --width "$WIDTH" --height "$HEIGHT" --fps "$FPS" \
    --keep-temp
else
  sh "$PIPELINE" "$PROJECT" --voice "$VOICE_OUT" --subtitles "$SUBTITLES" \
    --output "$OUTPUT" --width "$WIDTH" --height "$HEIGHT" --fps "$FPS"
fi

echo "[4/4] Hoàn tất."
echo "Video:     $OUTPUT"
echo "Voice:     $VOICE_OUT"
echo "Subtitles: $SUBTITLES"
