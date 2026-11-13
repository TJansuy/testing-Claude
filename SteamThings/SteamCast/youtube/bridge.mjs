// @ts-check
// The bridge between yt-cast-receiver and the Python app: commands out as
// JSON lines on stdout, mpv state in through update() / ended().
import fs from 'node:fs';
import { DataStore, Player, PLAYER_STATUSES } from 'yt-cast-receiver';

/** @param {Record<string, unknown>} msg */
export function send(msg) {
  output(JSON.stringify(msg) + '\n');
}

/** Where `send` writes; replaced in tests. */
let output = (/** @type {string} */ line) => { process.stdout.write(line); };
/** @param {(line: string) => void} fn */
export function setOutput(fn) { output = fn; }

/** Keeps the receiver's pairing data in one JSON file, so phones stay linked. */
export class JsonFileStore extends DataStore {
  /** @param {string} file */
  constructor(file) {
    super();
    this.file = file;
    try {
      this.data = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    } catch {
      this.data = {};
    }
  }

  /** @template T @param {string} key @param {T} value */
  async set(key, value) {
    this.data[key] = value;
    if (this.file) await fs.promises.writeFile(this.file, JSON.stringify(this.data));
  }

  /** @template T @param {string} key @returns {Promise<T | null>} */
  async get(key) {
    return key in this.data ? this.data[key] : null;
  }
}

/** Forwards commands to mpv (through Python) and answers from mpv's last state. */
export class MpvPlayer extends Player {
  constructor() {
    super();
    this.state = { position: 0, duration: 0, volume: 100, muted: false, paused: false, idle: true, mine: false };
  }

  /** @param {import('yt-cast-receiver').Video} video @param {number} position */
  async doPlay(video, position) {
    send({ cmd: 'play', id: video.id, position: position || 0 });
    this.state = { ...this.state, mine: true, idle: false, paused: false, position: position || 0 };
    return true;
  }
  async doPause() { send({ cmd: 'pause' }); return true; }
  async doResume() { send({ cmd: 'resume' }); return true; }
  async doStop() { send({ cmd: 'stop' }); return true; }
  /** @param {number} position */
  async doSeek(position) { send({ cmd: 'seek', position }); return true; }
  /** @param {import('yt-cast-receiver').Volume} volume */
  async doSetVolume(volume) {
    send({ cmd: 'volume', level: volume.level, muted: volume.muted });
    return true;
  }
  async doGetVolume() { return { level: this.state.volume, muted: this.state.muted }; }
  async doGetPosition() { return this.state.position; }
  async doGetDuration() { return this.state.duration; }

  /** Applies a state update from Python and tells senders about changes made on the TV side. */
  async update(state) {
    const prev = this.state;
    this.state = { ...prev, ...state };
    if (!this.state.mine) return;
    const playing = this.status === PLAYER_STATUSES.PLAYING;
    const paused = this.status === PLAYER_STATUSES.PAUSED;
    if (this.state.paused && playing) await this.notifyExternalStateChange(PLAYER_STATUSES.PAUSED);
    else if (!this.state.paused && !this.state.idle && paused) await this.notifyExternalStateChange(PLAYER_STATUSES.PLAYING);
    else if (prev.volume !== this.state.volume || prev.muted !== this.state.muted) await this.notifyExternalStateChange();
  }

  /** The video reached its end: play the next one in the queue (YouTube's autoplay). */
  async ended() {
    await this.pause();
    if (this.getNavInfo().hasNext) await this.next();
    else await this.stop();
  }
}
