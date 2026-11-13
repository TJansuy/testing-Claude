#!/usr/bin/env bash
# Starts SteamCast. Works from the repository checkout or from the
# install.sh location; in Steam Game Mode output goes to a log file.
set -euo pipefail

here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
if [ -d "$here/steamcast" ]; then root="$here"; else root="$(dirname "$here")"; fi
export PYTHONPATH="$root${PYTHONPATH:+:$PYTHONPATH}"

if [ -t 1 ]; then
    exec python3 -m steamcast "$@"
fi
log_dir="${XDG_STATE_HOME:-$HOME/.local/state}/steamcast"
mkdir -p "$log_dir"
[ -f "$log_dir/steamcast.log" ] && mv -f "$log_dir/steamcast.log" "$log_dir/steamcast.log.1"
exec python3 -m steamcast "$@" >"$log_dir/steamcast.log" 2>&1
