// The message box: typing, sending, commands, files and pasted images.
import { systemLine } from '../chat/list';
import { $, input } from '../dom';
import { runCommand } from '../features/commands';
import { sendChat } from '../net/connection';
import { state } from '../state';
import { formatSize } from '../util';
import { autocompleteKey, update as updateAutocomplete } from './autocomplete';
import { closeDashboard } from './dashboard';

const text = $<HTMLTextAreaElement>('text');
const form = $<HTMLFormElement>('composer');

function autosize(): void {
  text.style.height = 'auto';
  text.style.height = Math.min(text.scrollHeight, 160) + 'px';
}

/** Puts text in the message box (e.g. "/whisper Bob: ") and focuses it. */
export function prefill(value: string): void {
  closeDashboard();
  text.value = value;
  text.focus();
  autosize();
}

text.addEventListener('input', autosize);
text.addEventListener('keydown', (e) => {
  // The command list gets first say over arrows, Tab, Enter and Esc while it's open.
  if (autocompleteKey(e)) { e.preventDefault(); return; }
  // Enter sends, Shift+Enter adds a new line (except while composing with an IME).
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = text.value;
  if (!value.trim()) return;
  if (runCommand(value) || sendChat({ text: value })) {
    text.value = '';
    autosize();
    updateAutocomplete();
  }
});

function sendFile(file: File): void {
  // Files travel base64-encoded (about 4/3 the size) inside a JSON message.
  const limit = Math.floor((state.maxBytes - 4096) * 3 / 4);
  if (file.size > limit) {
    systemLine('"' + file.name + '" is too big (' + formatSize(file.size) + '). The limit is ' + formatSize(limit) + '.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const data = String(reader.result);
    const ok = sendChat({
      file: { name: file.name || 'file', type: file.type || 'application/octet-stream', size: file.size, data: data.slice(data.indexOf(',') + 1) },
    });
    if (!ok) systemLine('Not connected: "' + file.name + '" wasn\'t sent');
  };
  reader.onerror = () => systemLine('Couldn\'t read "' + file.name + '"');
  reader.readAsDataURL(file);
}

const fileInput = input('file');
$('attach').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  Array.from(fileInput.files || []).forEach(sendFile);
  fileInput.value = '';
});

// Paste images straight into the chat.
text.addEventListener('paste', (e) => {
  const files = e.clipboardData && e.clipboardData.files;
  if (files && files.length) {
    e.preventDefault();
    Array.from(files).forEach(sendFile);
  }
});
