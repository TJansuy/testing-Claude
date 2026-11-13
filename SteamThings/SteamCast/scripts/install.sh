#!/usr/bin/env bash
# Installs SteamCast for the current user on SteamOS (Desktop Mode, Konsole).
# Nothing is written outside your home directory, so it survives SteamOS
# updates and needs no "steamos-readonly disable".
set -euo pipefail

usage() {
    cat <<USAGE
Usage: $0 [--with-airplay] [--no-steam]
  --with-airplay  also set up UxPlay (AirPlay) in a distrobox container
  --no-steam      don't add SteamCast to the Steam library
USAGE
}

with_airplay=0
add_to_steam=1
for arg in "$@"; do
    case "$arg" in
        --with-airplay) with_airplay=1 ;;
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
rm -rf "$dest"
mkdir -p "$dest" "$(dirname "$bin")" "$(dirname "$desktop")" "$(dirname "$config")"
cp -r "$src/steamcast" "$dest/"
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
