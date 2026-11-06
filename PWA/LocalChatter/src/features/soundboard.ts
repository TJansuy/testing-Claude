// Admin soundboard (in the dashboard) and the sound library dialog.
import { sendSound } from '../chat/sound-message';
import { $, el, input } from '../dom';
import type { SoundEntry } from '../sounds/db';
import { addFile, addFromUrl, library, remove, rename } from '../sounds/library';
import { playEntry, stopAll, unlock } from '../sounds/playback';
import { KEY, load, save } from '../storage';
import { formatSize } from '../util';
import { closeDashboard } from '../ui/dashboard';

const soundStatus = (text: string): void => { $('sound-status').textContent = text; };

export function refreshSoundboard(): Promise<void> {
  return library().then((lib) => {
    const wrap = $('sb-buttons');
    wrap.textContent = '';
    lib.forEach((e) => {
      const b = el('button', null, '🔊 ' + e.name);
      b.type = 'button';
      b.title = e.linkOnly ? 'Plays from its link' : '';
      b.addEventListener('click', () => { unlock(); sendSound(e); });
      wrap.appendChild(b);
    });
    $('sb-empty').hidden = lib.length > 0;
    renderSoundList(lib);
  });
}

function renderSoundList(lib: SoundEntry[]): void {
  const ul = $('sound-list');
  ul.textContent = '';
  if (!lib.length) { ul.appendChild(el('li', 'empty-row', 'No sounds yet.')); return; }
  lib.forEach((e) => {
    const li = el('li');
    li.appendChild(el('span', 'name', e.name));
    li.appendChild(el('span', 'meta', e.linkOnly ? 'link' : formatSize(e.size)));
    const actions: Array<[string, string, () => void]> = [
      ['▶', 'Preview ' + e.name + ' (only on this device)', () => {
        unlock();
        playEntry(e).catch(() => soundStatus('Couldn\'t play "' + e.name + '".'));
      }],
      ['✎', 'Rename ' + e.name, () => {
        const n = window.prompt('Rename sound', e.name);
        if (n && n.trim()) void rename(e.id, n).then(refreshSoundboard);
      }],
      ['🗑', 'Delete ' + e.name, () => {
        if (window.confirm('Delete "' + e.name + '" from this device?')) void remove(e.id).then(refreshSoundboard);
      }],
    ];
    actions.forEach(([label, aria, fn]) => {
      const b = el('button', null, label);
      b.type = 'button';
      b.setAttribute('aria-label', aria);
      b.addEventListener('click', fn);
      li.appendChild(b);
    });
    ul.appendChild(li);
  });
}

$('sb-stop').addEventListener('click', stopAll);
$('sb-manage').addEventListener('click', () => {
  closeDashboard();
  input('sound-embed').checked = load(KEY.embed) !== 'off';
  soundStatus('');
  void refreshSoundboard();
  $<HTMLDialogElement>('sounds').showModal();
});

const files = input('sound-files');
$('sound-files-add').addEventListener('click', () => files.click());
files.addEventListener('change', () => {
  const list = Array.from(files.files || []);
  files.value = '';
  soundStatus('Adding ' + list.length + (list.length === 1 ? ' sound…' : ' sounds…'));
  const added: string[] = [];
  const failed: string[] = [];
  void Promise.all(list.map((f) => addFile(f).then((e) => { added.push(e.name); }, (err: Error) => { failed.push(err.message); })))
    .then(() => {
      soundStatus((added.length ? 'Added ' + added.join(', ') + '. ' : '') + failed.join(' '));
      void refreshSoundboard();
    });
});

$('sound-url-add').addEventListener('click', () => {
  const url = input('sound-url').value.trim();
  if (!url) { soundStatus('Paste a link to a sound file first.'); return; }
  soundStatus('Downloading…');
  addFromUrl(url, input('sound-url-name').value.trim()).then((e) => {
    soundStatus(e.cached
      ? 'Downloaded "' + e.name + '" and saved it on this device.'
      : 'Saved "' + e.name + '" as a link: that site doesn\'t allow downloading (or you\'re offline), so it needs internet to play.');
    input('sound-url').value = '';
    input('sound-url-name').value = '';
    void refreshSoundboard();
  }, (err: Error) => soundStatus(err.message));
});

const embed = input('sound-embed');
embed.addEventListener('change', () => save(KEY.embed, embed.checked ? 'on' : 'off'));

// Browsers only allow sound after a tap; unlock audio on the first one.
document.addEventListener('pointerdown', unlock, { capture: true });
document.addEventListener('keydown', unlock, { capture: true });
