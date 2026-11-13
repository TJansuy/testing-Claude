#!/usr/bin/env bash
# Installs SteamCast for the current user on SteamOS (Desktop Mode, Konsole).
# Nothing is written outside your home directory, so it survives SteamOS
# updates and needs no "steamos-readonly disable".
set -euo pipefail

usage() {
    cat <<USAGE
Usage: $0 [--with-airplay] [--no-youtube] [--no-steam]
  --with-airplay  also set up UxPlay (AirPlay) in a distrobox container
  --no-youtube    skip YouTube casting (no Node.js or yt-dlp download)
  --no-steam      don't add SteamCast to the Steam library
USAGE
}

with_airplay=0
with_youtube=1
add_to_steam=1
for arg in "$@"; do
    case "$arg" in
        --with-airplay) with_airplay=1 ;;
        --no-youtube) with_youtube=0 ;;
        --no-steam) add_to_steam=0 ;;
        -h|--help) usage; exit 0 ;;
        *) usage; exit 2 ;;
    esac
done

die() { echo "error: $*" >&2; exit 1; }
say() { echo "==> $*"; }

src="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
dest="$HOME/.local/share/steamcast"
bin="$HOME/.local/bin/steamcast"
desktop="$HOME/.local/share/applications/steamcast.desktop"
config="${XDG_CONFIG_HOME:-$HOME/.config}/steamcast/steamcast.ini"

command -v python3 >/dev/null || die "python3 not found"
python3 -c 'import sys; sys.exit(sys.version_info < (3, 9))' || die "Python 3.9 or newer is needed"

say "Installing SteamCast to $dest"
# Keep $dest/node and $dest/bin (downloads) across reinstalls.
rm -rf "$dest/steamcast" "$dest/youtube"
mkdir -p "$dest" "$(dirname "$bin")" "$(dirname "$desktop")" "$(dirname "$config")"
cp -r "$src/steamcast" "$dest/"
mkdir -p "$dest/youtube"
cp "$src/youtube/package.json" "$src/youtube/package-lock.json" "$src/youtube/"*.mjs "$dest/youtube/"
find "$dest" -name __pycache__ -prune -exec rm -rf {} +
install -m 755 "$src/scripts/steamcast.sh" "$dest/steamcast.sh"
ln -sf "$dest/steamcast.sh" "$bin"
if [ ! -f "$config" ]; then
    cp "$src/steamcast.example.ini" "$config"
    say "Wrote default settings to $config"
fi

if command -v mpv >/dev/null; then
    say "Using mpv from $(command -v mpv)"
elif command -v flatpak >/dev/null; then
    if ! flatpak info io.mpv.Mpv >/dev/null 2>&1; then
        say "Installing the mpv player from Flathub (io.mpv.Mpv)"
        flatpak install --user --noninteractive flathub io.mpv.Mpv
    fi
else
    die "mpv not found and flatpak is unavailable to install it"
fi

# Downloads $1 to $2 and checks it against the SHA-256 listed for $3 in the sums file at $4.
fetch_verified() {
    local url="$1" out="$2" name="$3" sums_url="$4" expected actual
    curl -fsSL --retry 3 -o "$out" "$url"
    expected="$(curl -fsSL --retry 3 "$sums_url" | awk -v n="$name" '$2 == n || $2 == "*"n {print $1; exit}')"
    actual="$(sha256sum "$out" | awk '{print $1}')"
    [ -n "$expected" ] && [ "$expected" = "$actual" ] || { rm -f "$out"; die "checksum mismatch for $name"; }
}

node_ok() { "$1" -e 'process.exit(+process.versions.node.split(".")[0] < 18)' 2>/dev/null; }

if [ "$with_youtube" = 1 ]; then
    node=""
    if command -v node >/dev/null && node_ok node; then
        node="$(command -v node)"
    elif [ -x "$dest/node/bin/node" ] && node_ok "$dest/node/bin/node"; then
        node="$dest/node/bin/node"
    else
        case "$(uname -m)" in
            x86_64) arch=x64 ;; aarch64) arch=arm64 ;; *) die "no Node.js build for $(uname -m)" ;;
        esac
        # The newest LTS release listed by nodejs.org.
        version="$(curl -fsSL https://nodejs.org/dist/index.json | python3 -c \
            'import json, sys; print(next(r["version"] for r in json.load(sys.stdin) if r["lts"]))')"
        say "Downloading Node.js $version for YouTube casting"
        tarball="node-$version-linux-$arch.tar.xz"
        tmp="$(mktemp -d)"
        fetch_verified "https://nodejs.org/dist/$version/$tarball" "$tmp/$tarball" "$tarball" \
            "https://nodejs.org/dist/$version/SHASUMS256.txt"
        rm -rf "$dest/node"
        mkdir -p "$dest/node"
        tar -xJf "$tmp/$tarball" -C "$dest/node" --strip-components=1
        rm -rf "$tmp"
        node="$dest/node/bin/node"
    fi
    say "Installing YouTube receiver dependencies (node $("$node" --version))"
    (cd "$dest/youtube" && PATH="$(dirname "$node"):$PATH" npm ci --omit=dev --no-audit --no-fund --loglevel=error)

    say "Downloading yt-dlp (lets mpv play YouTube; it updates itself daily)"
    mkdir -p "$dest/bin"
    fetch_verified https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp "$dest/bin/yt-dlp" \
        yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS
    chmod +x "$dest/bin/yt-dlp"
fi

if [ "$with_airplay" = 1 ]; then
    command -v distrobox >/dev/null || die "distrobox not found (it ships with SteamOS 3.5 and later)"
    if ! distrobox list --no-color 2>/dev/null | grep -q steamcast-airplay; then
        say "Creating the steamcast-airplay container with UxPlay (this takes a few minutes)"
        distrobox create --yes --name steamcast-airplay --image docker.io/library/debian:trixie \
            --additional-packages "uxplay gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
gstreamer1.0-plugins-bad gstreamer1.0-libav gstreamer1.0-pulseaudio gstreamer1.0-gl gstreamer1.0-x"
    fi
    distrobox enter steamcast-airplay -- uxplay -h >/dev/null 2>&1 || true
    if ! systemctl is-active --quiet avahi-daemon; then
        echo "note: UxPlay announces itself through avahi-daemon, which is not running."
        echo "      Enable it once with: sudo systemctl enable --now avahi-daemon"
    fi
fi

cat >"$desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=SteamCast
Comment=Receive Google Cast, DLNA and AirPlay on the TV
Exec=$bin
Icon=video-display
Terminal=false
Categories=AudioVideo;Video;Player;
DESKTOP

if [ "$add_to_steam" = 1 ]; then
    if command -v steamos-add-to-steam >/dev/null && pgrep -x steam >/dev/null; then
        say "Adding SteamCast to your Steam library"
        steamos-add-to-steam "$desktop" || echo "note: add it by hand: Steam > Add a Game > Add a Non-Steam Game > SteamCast"
    else
        echo "To launch from Game Mode: Steam > Add a Game > Add a Non-Steam Game > SteamCast"
    fi
fi

say "Done. Start it with 'steamcast' or from Steam; settings: $config"
