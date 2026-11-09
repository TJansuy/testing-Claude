// The scoreboard and the line under it: who's serving, why a point ended,
// who won. Your own side is always on the left of the screen.
import { I, PHASE, Side } from './physics';

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const REASON = ['', 'Out!', 'Into the net.', 'Two bounces.', 'Hit it twice.', 'Missed the serve.'];

export class Hud {
  names: [string, string] = ['', ''];
  me: -1 | Side = -1;
  waiting = '';
  private last = '';

  /** Updates the scoreboard from the game's state (only what changed). */
  update(s: Float64Array, mirrored: boolean): void {
    const L = mirrored ? 1 : 0, R = 1 - L;
    const who = (sd: number): string => (sd === this.me ? 'You' : this.names[sd] || (sd === 0 ? 'Left' : 'Right'));
    const phase = s[I.PHASE];
    const pointTo = who(s[I.POINT_TO]);
    let status = this.waiting;
    if (!status) {
      if (phase === PHASE.SERVE) status = who(s[I.SERVER]) + (s[I.SERVER] === this.me ? ' serve' : ' to serve');
      else if (phase === PHASE.RALLY) status = 'Rally · ' + s[I.RALLY_HITS] + (s[I.RALLY_HITS] === 1 ? ' shot' : ' shots');
      else if (phase === PHASE.POINT) status = REASON[s[I.WHY]] + ' Point to ' + (pointTo === 'You' ? 'you' : pointTo) + '.';
      else status = pointTo + (pointTo === 'You' ? ' win' : ' wins') + ' the game, ' + Math.max(s[I.SCORE0], s[I.SCORE1]) + '–' + Math.min(s[I.SCORE0], s[I.SCORE1]) + '! New game in a moment.';
    }
    const text = [who(L), s[I.SCORE0 + L], status, s[I.SCORE0 + R], who(R), L].join('|');
    if (text === this.last) return;
    this.last = text;
    $('name-l').textContent = who(L);
    $('name-r').textContent = who(R);
    $('score-l').textContent = String(s[I.SCORE0 + L]);
    $('score-r').textContent = String(s[I.SCORE0 + R]);
    $('hud').dataset.left = String(L);
    $('status').textContent = status;
  }
}
