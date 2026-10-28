#!/usr/bin/env bash
# Fills React Native's shared download cache before `pod install` needs it.
#
# `pod install` fetches four prebuilt tarballs (core and dependencies, debug and
# release, about 200 MB together) with a bare `curl`: no retry, no timeout on a
# stalled transfer. On 2026-10-28 one of them crawled at 7 KB/s for 21 minutes,
# broke off, and failed the iOS release with "Failed to download
# reactnative-core-0.88.0-debug.tar.gz", which reads like a broken dependency
# and was the network.
#
# React Native checks ~/Library/Caches/ReactNative first and copies from there
# when the file's SHA-1 matches Maven's, so a file put there in advance is never
# downloaded again. This puts them there with retries, a stall timeout and both
# mirrors, and verifies each against its published SHA-1 so a truncated file
# is never left in the cache for `pod install` to trust.
#
# Usage: prefetch-react-native-ios.sh <react-native version> [cache dir]
set -euo pipefail

version="${1:?react-native version required}"
cache="${2:-$HOME/Library/Caches/ReactNative}"
mkdir -p "$cache"

# Maven Central first, then React Native's own mirror: the order pod install
# uses is mirror first, and a stalled mirror is what this exists for.
mirrors=(
  "https://repo1.maven.org/maven2"
  "https://repo.reactnative.dev/maven2"
)

sha1_of() {
  shasum -a 1 "$1" | awk '{print $1}'
}

# The SHA-1 Maven publishes beside the artifact, or nothing if no mirror has it.
expected_sha1() {
  local path="$1" mirror sha
  for mirror in "${mirrors[@]}"; do
    sha="$(curl -fsSL --retry 3 --retry-all-errors --connect-timeout 20 --max-time 60 \
      "$mirror/$path.sha1" 2>/dev/null | tr -d '[:space:]' | tr 'A-F' 'a-f' || true)"
    if [[ "$sha" =~ ^[a-f0-9]{40}$ ]]; then
      echo "$sha"
      return 0
    fi
  done
  return 1
}

fetch() {
  local kind="$1" config="$2"
  local file="reactnative-$kind-$version-$config.tar.gz"
  local path="com/facebook/react/react-native-artifacts/$version/react-native-artifacts-$version-reactnative-$kind-$config.tar.gz"
  local target="$cache/$file" tmp="$cache/$file.download" want mirror

  if ! want="$(expected_sha1 "$path")"; then
    echo "::warning::No SHA-1 published for $file; leaving it to pod install."
    return 0
  fi

  if [[ -f "$target" && "$(sha1_of "$target")" == "$want" ]]; then
    echo "Cached: $file"
    return 0
  fi
  rm -f "$target"

  for mirror in "${mirrors[@]}"; do
    echo "Downloading $file from $mirror"
    # --speed-limit/--speed-time abort a transfer under 50 KB/s for a minute,
    # and --retry then starts it again, which a bare curl never does.
    if curl -fL --retry 5 --retry-all-errors --retry-delay 10 \
      --connect-timeout 20 --speed-limit 51200 --speed-time 60 \
      -A "react-native-$version" -o "$tmp" "$mirror/$path"; then
      if [[ "$(sha1_of "$tmp")" == "$want" ]]; then
        mv "$tmp" "$target"
        echo "Saved: $file"
        return 0
      fi
      echo "::warning::$file from $mirror did not match its SHA-1; trying the next mirror."
    fi
    rm -f "$tmp"
  done

  # Not fatal: pod install will try once more itself, and fail loudly if it
  # cannot either. This step only ever makes that less likely.
  echo "::warning::Could not prefetch $file; pod install will download it."
}

for kind in dependencies core; do
  for config in debug release; do
    fetch "$kind" "$config"
  done
done
