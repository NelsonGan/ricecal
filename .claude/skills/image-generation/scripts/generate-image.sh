#!/usr/bin/env bash
# Generate (or edit) raster images through whichever image-capable agent CLI is
# installed and signed in, billed to that tool's own subscription (no API key).
#
# Usage:
#   generate-image.sh -o out.png [-b BACKEND] [-n COUNT] [-i ref.png]... [-e] [-t] "brief"
#   generate-image.sh -l
#
#   -o PATH     Output file. With -n > 1, files are PATH-1.png, PATH-2.png, ...
#   -b BACKEND  codex | antigravity | auto (default: $IMAGE_BACKEND, else auto).
#               auto tries each installed backend in turn until one draws.
#   -n COUNT    Number of variants (one generation call each). Default 1.
#   -i FILE     Reference/edit image to attach (repeatable).
#   -e          Treat the first -i image as an edit target (preserve everything
#               the brief does not ask to change), not just a style reference.
#   -t          Ask for a genuinely transparent background (keeps alpha).
#   -m MODEL    Model override for the backend's agent. Normally leave unset.
#   -l          List the backends found on this machine and exit.
#
# Prints the absolute path of each saved image, one per line, on stdout, and
# "backend: <name>" on stderr. Each backend's transcript goes to a temp dir;
# its path is printed on failure.
set -euo pipefail

usage() { sed -n '2,22p' "$0" >&2; exit 2; }

# The order auto tries them in. Codex first: it keeps a real alpha channel and
# honours edit targets reliably, and it has drawn every committed RiceCal image.
BACKENDS=(codex antigravity)

TMPDIR="${TMPDIR:-/tmp}"

find_codex() {
  if [[ -n "${CODEX_BIN:-}" ]]; then [[ -x "$CODEX_BIN" ]] && echo "$CODEX_BIN"; return; fi
  if command -v codex >/dev/null 2>&1; then command -v codex; return; fi
  local p
  for p in /Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex \
           /Applications/Codex.app/Contents/Resources/codex; do
    [[ -x "$p" ]] && { echo "$p"; return; }
  done
  return 1
}

find_agy() {
  if [[ -n "${AGY_BIN:-}" ]]; then [[ -x "$AGY_BIN" ]] && echo "$AGY_BIN"; return; fi
  if command -v agy >/dev/null 2>&1; then command -v agy; return; fi
  [[ -x /opt/homebrew/bin/agy ]] && { echo /opt/homebrew/bin/agy; return; }
  return 1
}

available() {
  case "$1" in
    codex) find_codex >/dev/null ;;
    antigravity) find_agy >/dev/null ;;
    *) return 1 ;;
  esac
}

out="" count=1 transparent=0 edit=0 model="" list=0
backend="${IMAGE_BACKEND:-auto}"
images=()
while getopts "o:b:n:i:etm:l" opt; do
  case "$opt" in
    o) out="$OPTARG" ;;
    b) backend="$OPTARG" ;;
    n) count="$OPTARG" ;;
    i) images+=("$(cd "$(dirname "$OPTARG")" && pwd)/$(basename "$OPTARG")") ;;
    e) edit=1 ;;
    t) transparent=1 ;;
    m) model="$OPTARG" ;;
    l) list=1 ;;
    *) usage ;;
  esac
done
shift $((OPTIND - 1))

if (( list )); then
  for b in "${BACKENDS[@]}"; do
    if available "$b"; then echo "$b"; fi
  done
  exit 0
fi

prompt="${*:-}"
[[ -n "$out" && -n "$prompt" ]] || usage
[[ "$count" =~ ^[1-9][0-9]*$ ]] || { echo "-n needs a whole number above zero" >&2; exit 2; }
for img in "${images[@]+"${images[@]}"}"; do
  [[ -f "$img" ]] || { echo "No such image: $img" >&2; exit 2; }
done

out_dir="$(mkdir -p "$(dirname "$out")" && cd "$(dirname "$out")" && pwd)"
out_base="$(basename "$out")"
out_stem="${out_base%.*}"

# The path variant i (1-based) is saved to, before its extension.
dest_stem() {
  if (( count == 1 )); then echo "$out_dir/$out_stem"; else echo "$out_dir/$out_stem-$1"; fi
}

# The brief, wrapped in what every backend is told. $1 names the tool.
instructions() {
  local tool="$1" s
  s="Use your built-in ${tool} tool (not a script, not code, not SVG/HTML) to generate exactly ${count} image(s)"
  if (( count > 1 )); then
    s+=", one separate ${tool} call per variant, each a distinct take on the brief"
  fi
  s+=". Do not ask questions; make reasonable choices."
  if (( transparent )); then
    s+=" The background must be genuinely transparent (real alpha channel), no checkerboard, no backdrop, no drop shadow plate."
  fi
  if (( ${#images[@]} )); then
    if (( edit )); then
      s+=" The first attached image is the EDIT TARGET: change only what the brief asks for and keep everything else identical. Any other attached images are references."
    else
      s+=" The attached image(s) are REFERENCES for style/subject only; create a new image."
    fi
  fi
  printf '%s' "$s"
}

# Copies a generated file to variant i's destination and prints the path. A
# backend that produced a JPEG or WebP for a .png request is converted, so the
# extension never lies about the bytes. Each step is checked by hand: deliver
# runs inside `try ... ||`, where bash ignores set -e, so a failed copy would
# otherwise still print a path to a file that is not there.
deliver() {
  local src="$1" i="$2" stem ext want
  stem="$(dest_stem "$i")"
  ext="$(printf '%s' "${src##*.}" | tr '[:upper:]' '[:lower:]')"
  want="$(printf '%s' "${out_base##*.}" | tr '[:upper:]' '[:lower:]')"
  if [[ "$want" == png && "$ext" != png ]] && command -v sips >/dev/null 2>&1; then
    sips -s format png "$src" --out "$stem.png" >/dev/null || { echo "could not convert $src" >&2; return 1; }
    echo "$stem.png"
  else
    cp "$src" "$stem.$ext" || { echo "could not copy $src" >&2; return 1; }
    echo "$stem.$ext"
  fi
}

run_codex() {
  local bin log thread_id gen_dir i src
  bin="$(find_codex)" || { echo "codex: CLI not found (set CODEX_BIN)" >&2; return 1; }
  local codex_home="${CODEX_HOME:-$HOME/.codex}"
  log="$(mktemp -d "${TMPDIR%/}/generate-image.codex.XXXXXX")/run.jsonl"

  local text
  text="$(instructions image_gen) Do not copy, move or post-process the files yourself; just generate them and then reply DONE.

Brief:
${prompt}"

  local args=(exec --skip-git-repo-check --ephemeral -s read-only --json
              -c model_reasoning_effort=low -C "$out_dir")
  [[ -n "$model" ]] && args+=(-m "$model")
  for img in "${images[@]+"${images[@]}"}"; do args+=(-i "$img"); done

  # `--` matters: codex's -i is variadic and would otherwise swallow the prompt.
  "$bin" "${args[@]}" -- "$text" </dev/null >"$log" 2>"$log.err" || {
    echo "codex: exec failed (see $log and $log.err)" >&2
    tail -5 "$log.err" >&2
    return 1
  }

  thread_id="$(head -1 "$log" | sed -n 's/.*"thread_id":"\([^"]*\)".*/\1/p')"
  gen_dir="$codex_home/generated_images/$thread_id"
  if [[ -z "$thread_id" || ! -d "$gen_dir" ]]; then
    echo "codex: no images generated (thread ${thread_id:-?}, transcript $log). Last messages:" >&2
    grep -o '"text":"[^"]*"' "$log" | tail -3 >&2 || true
    return 1
  fi

  i=0
  # Oldest first so -1, -2, ... follow generation order.
  while IFS= read -r src; do
    (( i < count )) || break
    i=$((i + 1))
    deliver "$src" "$i" || return 1
  done < <(ls -tr "$gen_dir"/*.png "$gen_dir"/*.jpg "$gen_dir"/*.webp 2>/dev/null)

  (( i > 0 )) || { echo "codex: generated folder was empty: $gen_dir" >&2; return 1; }
  (( i == count )) || echo "codex: asked for $count images, got $i" >&2
  rm -rf "$(dirname "$log")"
}

run_antigravity() {
  local bin work log marker i
  bin="$(find_agy)" || { echo "antigravity: agy CLI not found (set AGY_BIN)" >&2; return 1; }
  work="$(mktemp -d "${TMPDIR%/}/generate-image.agy.XXXXXX")"
  log="$work/run.jsonl"
  marker="$work/started"
  : >"$marker"

  # Antigravity's agent saves into its own brain folder, so it is told where to
  # copy each image, and the folder is searched afterwards in case it did not.
  local targets="" refs=""
  for (( i = 1; i <= count; i++ )); do targets+="
- image $i: $work/out-$i.<the generated file's own extension>"; done
  for img in "${images[@]+"${images[@]}"}"; do refs+="
- $img"; done

  local text
  text="$(instructions generate_image)"
  [[ -n "$refs" ]] && text+=" Pass these files to generate_image as its reference images:${refs}"
  text+="
After generating, copy each image (cp in the shell, no conversion, no edits) to exactly:${targets}
Then reply DONE.

Brief:
${prompt}"

  local args=(--dangerously-skip-permissions --output-format stream-json
              --print-timeout 15m --add-dir "$work")
  args+=(--model "${model:-gemini-3.8-flash-low}")
  for img in "${images[@]+"${images[@]}"}"; do args+=(--add-dir "$(dirname "$img")"); done

  # The prompt is attached with `=`: agy's -p takes the next word as the
  # prompt, so a flag after a bare -p would be read as the prompt instead.
  (cd "$work" && "$bin" "${args[@]}" --print="$text") </dev/null >"$log" 2>"$log.err" || {
    echo "antigravity: agy failed (see $log and $log.err)" >&2
    tail -5 "$log.err" >&2
    return 1
  }

  local found=() f
  for (( i = 1; i <= count; i++ )); do
    for f in "$work/out-$i".*; do [[ -f "$f" ]] && found+=("$f"); done
  done

  # This run's conversations: the top one and any image subagent it started.
  local brain="${AGY_BRAIN:-$HOME/.gemini/antigravity-cli/brain}" id ids=()
  while IFS= read -r id; do [[ -n "$id" ]] && ids+=("$id"); done < <(
    grep -o '"conversation_id":"[^"]*"' "$log" | cut -d'"' -f4 | sort -u)

  if (( ${#found[@]} == 0 )); then
    # The agent did not copy them: take what those conversations wrote after
    # this run started.
    for id in "${ids[@]+"${ids[@]}"}"; do
      [[ -d "$brain/$id" ]] || continue
      while IFS= read -r f; do found+=("$f"); done < <(
        find "$brain/$id" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) \
          -newer "$marker" 2>/dev/null)
    done
  fi

  if (( ${#found[@]} == 0 )); then
    echo "antigravity: no images generated (transcript $log)." >&2
    local quota=0
    grep -q -E 'RESOURCE_EXHAUSTED|QUOTA_EXHAUSTED' "$log" 2>/dev/null && quota=1
    for id in "${ids[@]+"${ids[@]}"}"; do
      grep -q -E 'RESOURCE_EXHAUSTED|QUOTA_EXHAUSTED' "$brain/$id/.system_generated/logs/transcript.jsonl" 2>/dev/null && quota=1
    done
    (( quota )) && echo "antigravity: the image model's quota is used up; it resets on its own." >&2
    grep -o '"response":"[^"]*"' "$log" | tail -1 | cut -c1-400 >&2 || true
    return 1
  fi

  i=0
  for f in "${found[@]}"; do
    (( i < count )) || break
    i=$((i + 1))
    deliver "$f" "$i" || return 1
  done
  (( i == count )) || echo "antigravity: asked for $count images, got $i" >&2
  rm -rf "$work"
}

# A transparent request that came back opaque is a failure worth saying out
# loud: an opaque sticker over the UI is a white box.
check_alpha() {
  (( transparent )) || return 0
  command -v sips >/dev/null 2>&1 || return 0
  local f bad=0
  for f in "$@"; do
    if ! sips -g hasAlpha "$f" 2>/dev/null | grep -q 'hasAlpha: yes'; then
      echo "warning: $f has no alpha channel" >&2
      bad=1
    fi
  done
  return $bad
}

try() {
  local name="$1" out_paths p
  out_paths="$(run_"$name")" || return 1
  local paths=()
  while IFS= read -r p; do [[ -n "$p" ]] && paths+=("$p"); done <<<"$out_paths"
  (( ${#paths[@]} )) || return 1
  if ! check_alpha "${paths[@]}"; then
    # Kept beside the destination rather than deleted, since the drawing cost
    # quota and may still do as a mockup or a reference.
    for p in "${paths[@]}"; do mv -f "$p" "${p%.*}.opaque.${p##*.}"; done
    echo "$name: came back without transparency, kept as *.opaque.* beside the output" >&2
    return 1
  fi
  echo "backend: $name" >&2
  printf '%s\n' "${paths[@]}"
}

case "$backend" in
  auto)
    tried=0
    for b in "${BACKENDS[@]}"; do
      available "$b" || continue
      tried=1
      try "$b" && exit 0
    done
    (( tried )) || echo "No image backend found. Install and sign in to one of: ${BACKENDS[*]}." >&2
    exit 1
    ;;
  codex|antigravity)
    try "$backend" || exit 1
    ;;
  *)
    echo "Unknown backend: $backend (one of: auto ${BACKENDS[*]})" >&2
    exit 2
    ;;
esac
