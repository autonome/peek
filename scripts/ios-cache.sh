#!/bin/bash
# iOS build cache utilities
# Caches Rust build artifacts to avoid rebuilds across agent workspaces

# Cache location (relative to repo root)
IOS_CACHE_DIR="tmp/ios-cache"

# Get the repository root directory
get_repo_root() {
    git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
}

# Compute hash of Rust source files that affect the build
# Includes Cargo.toml, Cargo.lock, and all .rs files
get_source_hash() {
    local tauri_dir="$1"

    if [ -z "$tauri_dir" ]; then
        echo "Error: tauri_dir required" >&2
        return 1
    fi

    # Hash Cargo files and all Rust source files
    cat "$tauri_dir/Cargo.toml" \
        "$tauri_dir/Cargo.lock" \
        "$tauri_dir/src"/*.rs 2>/dev/null | shasum -a 256 | cut -d' ' -f1
}

# Check if cache is valid for a given build type
# Returns 0 if cache hit, 1 if cache miss
# Usage: check_cache debug|release tauri_dir
check_cache() {
    local build_type="$1"
    local tauri_dir="$2"
    local repo_root
    repo_root="$(get_repo_root)"

    local cache_dir="$repo_root/$IOS_CACHE_DIR/$build_type"
    local lib_path="$cache_dir/libapp.a"
    local checksum_path="$cache_dir/checksum.txt"

    # Check if cached files exist
    if [ ! -f "$lib_path" ] || [ ! -f "$checksum_path" ]; then
        echo "Cache miss: no cached $build_type build found"
        return 1
    fi

    # Compare checksums
    local current_hash
    local cached_hash
    current_hash="$(get_source_hash "$tauri_dir")"
    cached_hash="$(cat "$checksum_path")"

    if [ "$current_hash" = "$cached_hash" ]; then
        echo "Cache hit: $build_type build matches (hash: ${current_hash:0:8}...)"
        return 0
    else
        echo "Cache miss: source changed (cached: ${cached_hash:0:8}..., current: ${current_hash:0:8}...)"
        return 1
    fi
}

# Update cache with newly built library
# Usage: update_cache debug|release tauri_dir lib_path
update_cache() {
    local build_type="$1"
    local tauri_dir="$2"
    local lib_path="$3"
    local repo_root
    repo_root="$(get_repo_root)"

    local cache_dir="$repo_root/$IOS_CACHE_DIR/$build_type"

    # Create cache directory if needed
    mkdir -p "$cache_dir"

    # Copy library to cache
    cp "$lib_path" "$cache_dir/libapp.a"

    # Save checksum
    get_source_hash "$tauri_dir" > "$cache_dir/checksum.txt"

    echo "Cache updated: $build_type build saved to $cache_dir"
}

# Copy cached library to workspace destination
# Usage: use_cache debug|release dest_path
use_cache() {
    local build_type="$1"
    local dest_path="$2"
    local repo_root
    repo_root="$(get_repo_root)"

    local cache_dir="$repo_root/$IOS_CACHE_DIR/$build_type"
    local lib_path="$cache_dir/libapp.a"

    # Ensure destination directory exists
    mkdir -p "$(dirname "$dest_path")"

    # Copy from cache
    cp "$lib_path" "$dest_path"

    echo "Using cached $build_type build: $dest_path"
}

# Clear cache for a build type or all caches
# Usage: clear_cache [debug|release]
clear_cache() {
    local build_type="$1"
    local repo_root
    repo_root="$(get_repo_root)"

    if [ -z "$build_type" ]; then
        rm -rf "$repo_root/$IOS_CACHE_DIR"
        echo "Cleared all iOS build caches"
    else
        rm -rf "$repo_root/$IOS_CACHE_DIR/$build_type"
        echo "Cleared $build_type iOS build cache"
    fi
}
