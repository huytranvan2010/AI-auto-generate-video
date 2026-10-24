#!/bin/sh
# ashell-video-pipeline.sh
# Pipeline FFmpeg chạy trên a-Shell/iOS.
#
# Chức năng:
#   1) Đọc các clip trong clips/ theo thứ tự tên file.
#   2) Chuẩn hóa từng clip về video dọc 1080x1920, 30 FPS, H.264.
#   3) Ghép các clip bằng concat demuxer.
#   4) Lồng voice.mp3/m4a/wav.
#   5) Tùy chọn trộn music.mp3 với âm lượng nhỏ.
#   6) Tùy chọn burn phụ đề .srt hoặc .ass.
#
# Tương thích với sh của a-Shell; không phụ thuộc Node.js, Python hay Docker.
#
# Cấu trúc thư mục mặc định:
#   project/
#   ├── clips/             # clip-01.mp4, clip-02.mp4, clip-03.mp4 ...
#   ├── voice.mp3          # bắt buộc
#   ├── music.mp3          # tùy chọn
#   ├── subtitles.srt      # tùy chọn
#   └── output.mp4         # tự tạo
#
# Cách dùng:
#   sh ashell-video-pipeline.sh /path/to/project
#   sh ashell-video-pipeline.sh /path/to/project --voice voice.mp3 \
#       --music music.mp3 --subtitles subtitles.srt --output final.mp4
#
# Tùy chọn:
#   --voice FILE       File voice-over; mặc định: project/voice.mp3
#   --music FILE       Nhạc nền; bỏ qua nếu không truyền
#   --subtitles FILE   SRT/ASS; bỏ qua nếu không truyền
#   --output FILE      File MP4 đầu ra; mặc định: project/output.mp4
#   --width N          Chiều rộng; mặc định 1080
#   --height N         Chiều cao; mặc định 1920
#   --fps N            FPS; mặc định 30
#   --music-volume N   Âm lượng nhạc 0.0-1.0; mặc định 0.12
#   --keep-temp        Giữ file trung gian để debug
#   -h, --help         Hiển thị hướng dẫn

set -eu

SCRIPT_NAME="$(basename "$0")"
WIDTH=1080
HEIGHT=1920
FPS=30
MUSIC_VOLUME=0.12
KEEP_TEMP=0

usage() {
  sed -n '1,55p' "$0"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Không tìm thấy lệnh '$1'."
}

# Escape một path cho concat demuxer của FFmpeg.
concat_escape() {
  # a-Shell paths are normally simple POSIX paths. Keep slash characters
  # untouched; escaping them turns /tmp/... into a broken path.
  # The pipeline's generated temp paths do not contain apostrophes.
  printf "file '%s'\\n" "$1"
}

# Escape path cho filter subtitles=...
subtitle_escape() {
  value=$1
  value=$(printf '%s' "$value" | sed 's/\\/\\\\/g')
  value=$(printf '%s' "$value" | sed 's/:/\\:/g')
  value=$(printf '%s' "$value" | sed "s/'/\\\\'/g")
  printf '%s' "$value"
}

is_number_0_to_1() {
  awk -v n="$1" 'BEGIN { exit !(n >= 0 && n <= 1) }'
}

PROJECT=""
VOICE=""
MUSIC=""
SUBTITLES=""
OUTPUT=""

[ "$#" -gt 0 ] || { usage; exit 2; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --voice)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --voice."
      VOICE=$2
      shift 2
      ;;
    --music)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --music."
      MUSIC=$2
      shift 2
      ;;
    --subtitles)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --subtitles."
      SUBTITLES=$2
      shift 2
      ;;
    --output)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --output."
      OUTPUT=$2
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
    --music-volume)
      [ "$#" -ge 2 ] || fail "Thiếu giá trị cho --music-volume."
      MUSIC_VOLUME=$2
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
      [ -z "$PROJECT" ] || fail "Chỉ truyền một project directory."
      PROJECT=$1
      shift
      ;;
  esac
done

[ -n "$PROJECT" ] || fail "Thiếu project directory."
[ -d "$PROJECT" ] || fail "Không tìm thấy thư mục: $PROJECT"

need_cmd ffmpeg
need_cmd ffprobe
need_cmd find
need_cmd sort
need_cmd sed
need_cmd awk

CLIPS_DIR="$PROJECT/clips"
[ -d "$CLIPS_DIR" ] || fail "Thiếu thư mục clips/: $CLIPS_DIR"

[ -n "$VOICE" ] || VOICE="$PROJECT/voice.mp3"
[ -n "$OUTPUT" ] || OUTPUT="$PROJECT/output.mp4"

[ -f "$VOICE" ] || fail "Không tìm thấy voice: $VOICE"
[ -n "$MUSIC" ] && [ -f "$MUSIC" ] || [ -z "$MUSIC" ] || fail "Không tìm thấy music: $MUSIC"
[ -n "$SUBTITLES" ] && [ -f "$SUBTITLES" ] || [ -z "$SUBTITLES" ] || fail "Không tìm thấy subtitles: $SUBTITLES"
is_number_0_to_1 "$MUSIC_VOLUME" || fail "--music-volume phải nằm trong khoảng 0.0 đến 1.0."

mkdir -p "$(dirname "$OUTPUT")"

TMP_DIR="$PROJECT/.ashell-video-tmp-$$"
mkdir -p "$TMP_DIR/normalized"

cleanup() {
  status=$?
  if [ "$KEEP_TEMP" -eq 1 ]; then
    echo "Giữ file trung gian tại: $TMP_DIR"
  else
    rm -rf "$TMP_DIR"
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM

CLIP_INDEX="$TMP_DIR/clips.index"
: > "$CLIP_INDEX"

# find + sort tạo thứ tự ổn định: clip-01, clip-02, clip-03...
find "$CLIPS_DIR" -maxdepth 1 -type f \( \
  -iname '*.mp4' -o -iname '*.mov' -o -iname '*.m4v' -o -iname '*.mkv' \
\) -print | sort > "$CLIP_INDEX"

CLIP_COUNT=$(wc -l < "$CLIP_INDEX" | tr -d ' ')
[ "$CLIP_COUNT" -gt 0 ] || fail "Không có clip MP4/MOV/M4V/MKV trong $CLIPS_DIR"

echo "== a-Shell FFmpeg video pipeline =="
echo "Project:    $PROJECT"
echo "Clips:      $CLIP_COUNT"
echo "Voice:      $VOICE"
echo "Music:      ${MUSIC:-không dùng}"
echo "Subtitles:  ${SUBTITLES:-không dùng}"
echo "Output:     $OUTPUT"
echo "Canvas:     ${WIDTH}x${HEIGHT} @ ${FPS}fps"
echo

echo "[1/5] Chuẩn hóa $CLIP_COUNT clip..."
NORMALIZED_LIST="$TMP_DIR/normalized.concat.txt"
: > "$NORMALIZED_LIST"

INDEX=1
while IFS= read -r CLIP; do
  [ -n "$CLIP" ] || continue
  NORMALIZED="$TMP_DIR/normalized/clip-$(printf '%04d' "$INDEX").mp4"
  echo "  - $(basename "$CLIP")"

  ffmpeg -nostdin -hide_banner -loglevel error -y \
    -i "$CLIP" \
    -map 0:v:0 \
    -vf "scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${FPS},format=yuv420p" \
    -an \
    -c:v libx264 \
    -preset ultrafast \
    -crf 20 \
    -movflags +faststart \
    "$NORMALIZED" \
    || fail "Không thể chuẩn hóa clip: $CLIP"

  concat_escape "$NORMALIZED" >> "$NORMALIZED_LIST"
  INDEX=$((INDEX + 1))
done < "$CLIP_INDEX"

echo "[2/5] Ghép video silent..."
SILENT_VIDEO="$TMP_DIR/video-silent.mp4"
ffmpeg -nostdin -hide_banner -loglevel error -y \
  -f concat \
  -safe 0 \
  -i "$NORMALIZED_LIST" \
  -an \
  -c:v libx264 \
  -preset ultrafast \
  -crf 20 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  "$SILENT_VIDEO" \
  || fail "Không thể ghép các clip."

echo "[3/5] Lồng voice$( [ -n "$MUSIC" ] && printf ' + music' )..."
WITH_AUDIO="$TMP_DIR/video-audio.mp4"

if [ -n "$MUSIC" ]; then
  # Input 0: video silent; input 1: voice; input 2: music loop.
  ffmpeg -nostdin -hide_banner -loglevel error -y \
    -i "$SILENT_VIDEO" \
    -i "$VOICE" \
    -stream_loop -1 -i "$MUSIC" \
    -filter_complex "[2:a]volume=${MUSIC_VOLUME}[bg];[1:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]" \
    -map 0:v:0 \
    -map "[aout]" \
    -c:v copy \
    -c:a aac \
    -b:a 192k \
    -shortest \
    -movflags +faststart \
    "$WITH_AUDIO" \
    || fail "Không thể trộn voice và music."
else
  ffmpeg -nostdin -hide_banner -loglevel error -y \
    -i "$SILENT_VIDEO" \
    -i "$VOICE" \
    -map 0:v:0 \
    -map 1:a:0 \
    -c:v copy \
    -c:a aac \
    -b:a 192k \
    -shortest \
    -movflags +faststart \
    "$WITH_AUDIO" \
    || fail "Không thể lồng voice."
fi

echo "[4/5] Xử lý phụ đề..."
if [ -n "$SUBTITLES" ]; then
  SUBTITLE_FILTER_PATH=$(subtitle_escape "$SUBTITLES")
  ffmpeg -nostdin -hide_banner -loglevel error -y \
    -i "$WITH_AUDIO" \
    -vf "subtitles=${SUBTITLE_FILTER_PATH}:force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=180'" \
    -c:v libx264 \
    -preset ultrafast \
    -crf 20 \
    -c:a copy \
    -movflags +faststart \
    "$OUTPUT" \
    || fail "Không thể burn phụ đề. Kiểm tra FFmpeg có libass không."
else
  cp "$WITH_AUDIO" "$OUTPUT"
fi

echo "[5/5] Kiểm tra output..."
[ -s "$OUTPUT" ] || fail "Output rỗng: $OUTPUT"
ffprobe -v error \
  -show_entries format=duration:stream=codec_type,codec_name,width,height \
  -of default=noprint_wrappers=1 \
  "$OUTPUT" || fail "Output tạo ra nhưng ffprobe không đọc được."

echo
echo "DONE: $OUTPUT"
echo "Để mở trong Files, dùng lệnh share của a-Shell hoặc vào thư mục Documents của a-Shell."
