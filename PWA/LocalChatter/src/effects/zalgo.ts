// Zalgo: turns all the chat's text into zalgo text and glitches the dashboard
// until stopped. Text typed in the message box stays readable, and every
// original is remembered and put back exactly.
import { EffectControl, vibrate } from './shared';

const TARGETS = ['.topbar', '#messages', '#effects-tray', '#stage', '#banner'];
interface Record_ { orig: string; mangled: string }
const zalgo = { active: false, observer: null as MutationObserver | null, nodes: new Map<Text, Record_>() };

export const zalgoActive = (): boolean => zalgo.active;

function randomMark(): string {
  let c: number;
  do { c = 0x300 + Math.floor(Math.random() * 0x70); } while (c === 0x34F); // skip the invisible joiner
  return String.fromCharCode(c);
}
function zalgoify(text: string, strength: number): string {
  let out = '';
  Array.from(text).forEach((ch) => {
    out += ch;
    if (/\s/.test(ch)) return;
    const n = 1 + Math.floor(Math.random() * strength);
    for (let i = 0; i < n; i++) out += randomMark();
  });
  return out;
}
function skip(node: Text): boolean {
  const p = node.parentElement;
  return !p || !!p.closest('textarea, input, select, script, style, dialog, .fx-dock');
}
function corrupt(node: Text): void {
  if (skip(node) || !(node.nodeValue || '').trim()) return;
  const known = zalgo.nodes.get(node);
  if (known && node.nodeValue === known.mangled) return; // our own change
  const strength = node.parentElement && node.parentElement.closest('#effects-tray') ? 8 : 5;
  const rec = { orig: node.nodeValue || '', mangled: zalgoify(node.nodeValue || '', strength) };
  zalgo.nodes.set(node, rec);
  node.nodeValue = rec.mangled;
}
function corruptTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) { corrupt(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const list: Text[] = [];
  while (walker.nextNode()) list.push(walker.currentNode as Text);
  list.forEach(corrupt);
}

function startZalgo(): void {
  if (zalgo.active) return;
  zalgo.active = true;
  document.body.classList.add('fx-zalgo');
  TARGETS.forEach((sel) => document.querySelectorAll(sel).forEach(corruptTree));
  // Keep corrupting anything new: incoming messages, status updates and so on.
  const observer = new MutationObserver((records) => {
    records.forEach((r) => {
      if (r.type === 'characterData') corrupt(r.target as Text);
      else r.addedNodes.forEach(corruptTree);
    });
  });
  TARGETS.forEach((sel) => document.querySelectorAll(sel).forEach((e) => {
    observer.observe(e, { childList: true, subtree: true, characterData: true });
  }));
  zalgo.observer = observer;
}

function stopZalgo(): void {
  if (!zalgo.active) return;
  zalgo.active = false;
  if (zalgo.observer) zalgo.observer.disconnect();
  zalgo.observer = null;
  zalgo.nodes.forEach((rec, node) => {
    // Only restore text we changed; if the app has since replaced it, leave that alone.
    if (node.isConnected && node.nodeValue === rec.mangled) node.nodeValue = rec.orig;
  });
  zalgo.nodes.clear();
  document.body.classList.remove('fx-zalgo');
}

export function startZalgoEffect(): EffectControl {
  vibrate([30, 30, 30, 30, 30]);
  startZalgo();
  return { stop: stopZalgo };
}
