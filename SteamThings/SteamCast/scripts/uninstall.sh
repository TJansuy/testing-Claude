#!/usr/bin/env bash
# Removes SteamCast. --purge also deletes settings and the AirPlay container.
set -euo pipefail
rm -rf "$HOME/.local/share/steamcast" "$HOME/.local/bin/steamcast" \
       "$HOME/.local/share/applications/steamcast.desktop"
if [ "${1:-}" = "--purge" ]; then
    rm -rf "${XDG_CONFIG_HOME:-$HOME/.config}/steamcast" "${XDG_STATE_HOME:-$HOME/.local/state}/steamcast"
    if command -v distrobox >/dev/null && distrobox list --no-color 2>/dev/null | grep -q steamcast-airplay; then
        distrobox rm --force steamcast-airplay
    fi
fi
echo "SteamCast removed. Remove its Steam shortcut from the library by hand."
