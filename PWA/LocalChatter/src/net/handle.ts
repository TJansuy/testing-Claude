// What to do with each message from the relay.
import { refreshLanguages, systemLine, systemNotice, banner } from '../chat/list';
import { renderMessage } from '../chat/message';
import { $ } from '../dom';
import { parseEffect, play } from '../effects';
import { away, notify, show } from '../features/background';
import { renderSystem } from '../features/roles';
import { addStop, removeStop } from '../features/stopdock';
import { whisperVisibility } from '../features/whispers';
import { chatGuess, handleGame, remindAboutGames } from '../games';
import { handlePoll, remindNewcomer } from '../polls';
import { DEFAULT_MAX_BYTES, state } from '../state';
import type { ServerMessage } from '../types';
import { renderPeople } from '../ui/status';

export function handle(msg: ServerMessage): void {
  switch (msg.type) {
    case 'welcome': {
      state.me = msg.you;
      state.maxBytes = msg.maxBytes || DEFAULT_MAX_BYTES;
      state.peers.clear();
      (msg.peers || []).forEach((p) => state.peers.set(p.id, p));
      $('room').textContent = msg.room || 'LocalChatter';
      document.title = msg.room || 'LocalChatter';
      banner(null);
      renderPeople();
      refreshLanguages();
      systemLine('You joined as ' + state.me.name + (state.role !== 'member' ? ' (role: ' + state.role + ')' : ''));
      break;
    }
    case 'system':
      show(() => renderSystem(msg));
      break;
    case 'effect': {
      // Targeted effect from someone in debug mode: everyone receives it, only the target plays it.
      const forMe = msg.to === 'all' || (!!state.me && msg.to === state.me.id);
      const fx = parseEffect('/' + msg.name);
      if (forMe && fx && !away()) play(fx.name, fx.arg);
      if (fx && msg.from && state.me && msg.from.id === state.me.id) {
        if (fx.arg === 'off') removeStop(fx.name);
        else addStop(fx.name, fx.arg, { target: msg.to });
      }
      show(() => renderSystem({ type: 'system', kind: 'effect', from: msg.from, name: msg.name, to: msg.to }));
      break;
    }
    case 'join': {
      const peer = msg.peer;
      state.peers.set(peer.id, peer);
      renderPeople();
      show(() => systemNotice(peer.name + ' joined'));
      remindNewcomer(peer); // tell them about the polls running
      remindAboutGames(peer);
      break;
    }
    case 'leave': {
      const peer = msg.peer;
      state.peers.delete(peer.id);
      renderPeople();
      show(() => systemNotice(peer.name + ' left'));
      break;
    }
    case 'rename': {
      const peer = msg.peer;
      if (state.me && peer.id === state.me.id) { state.me = peer; renderPeople(); break; }
      const old = state.peers.get(peer.id);
      state.peers.set(peer.id, peer);
      renderPeople();
      if (old) show(() => systemNotice(old.name + ' is now ' + peer.name));
      break;
    }
    case 'chat': {
      chatGuess(msg, msg.from); // hangman: its first letter is a guess (not for whispers)
      // Whispers reach every device; each app only shows them to their recipients
      // (and to spies watching those people).
      if (msg.to) {
        const seen = whisperVisibility(msg);
        if (!seen) break;
        if (seen === 'spy') msg.spied = true;
      }
      if (away()) notify(msg);
      show(() => renderMessage(msg, false));
      break;
    }
    case 'poll':
      handlePoll(msg);
      break;
    case 'game':
      handleGame(msg);
      break;
    case 'error':
      if (msg.message) systemLine(msg.message);
      break;
  }
}
