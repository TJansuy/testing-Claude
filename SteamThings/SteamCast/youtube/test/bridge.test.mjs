// Run with: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DefaultLogger, PLAYER_STATUSES } from 'yt-cast-receiver';
import { JsonFileStore, MpvPlayer, setOutput } from '../bridge.mjs';

const lines = [];
setOutput((line) => lines.push(JSON.parse(line)));
const quiet = new DefaultLogger();
quiet.setLevel('none');
const newPlayer = () => {
  const player = new MpvPlayer();
  player.setLogger(quiet); // the receiver does this in production
  return player;
};
const video = (id) => ({ id, client: { key: 'YT', theme: 'cl', name: 'YouTube' } });

test('play / pause / seek become commands for Python', async () => {
  lines.length = 0;
  const player = newPlayer();
  await player.play(video('abc'), 7);
  await player.pause();
  await player.seek(42);
  // Like a YouTube TV, a seek while paused resumes playback.
  assert.deepEqual(lines.map((l) => l.cmd), ['play', 'pause', 'seek', 'resume']);
  assert.deepEqual(lines[0], { cmd: 'play', id: 'abc', position: 7 });
  assert.deepEqual(lines[2], { cmd: 'seek', position: 42 });
});

test('pausing on the TV is reported to YouTube', async () => {
  const player = newPlayer();
  await player.play(video('abc'), 0);
  assert.equal(player.status, PLAYER_STATUSES.PLAYING);
  await player.update({ mine: true, paused: true, idle: false, position: 30, duration: 200 });
  assert.equal(player.status, PLAYER_STATUSES.PAUSED);
  assert.equal(await player.getPosition(), 30);
  await player.update({ mine: true, paused: false, idle: false });
  assert.equal(player.status, PLAYER_STATUSES.PLAYING);
});

test('end of a video with nothing queued stops', async () => {
  lines.length = 0;
  const player = newPlayer();
  await player.play(video('abc'), 0);
  await player.ended();
  assert.equal(lines.at(-1).cmd, 'stop');
});

test('pairing data persists to a JSON file', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-')), 'pairing.json');
  await new JsonFileStore(file).set('screen', { id: 1 });
  assert.deepEqual(await new JsonFileStore(file).get('screen'), { id: 1 });
});
