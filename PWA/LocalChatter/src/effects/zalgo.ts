// Zalgo: turns all the chat's text into zalgo text and glitches the dashboard
// until stopped. The corruption boils: every piece of text is re-scrambled
// several times a second. Text typed in the message box stays readable, and
// every original is remembered and put back exactly.
import { EffectControl, reducedMotion, vibrate } from './shared';

const TARGETS = ['.topbar', '#messages', '#effects-tray', '#banner'];
interface Record_ { orig: string; mangled: string }
const zalgo = {
  active: false,
  observer: null as MutationObserver | null,
  nodes: new Map<Text, Record_>(),
  timer: undefined as ReturnType<typeof setInterval> | undefined,
  /** Live regions muted while the text keeps changing, with what they were. */
  muted: [] as Array<[HTMLElement, string]>,
};
const BOIL_MS = 140;

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

/** Re-scrambles the text: most of it each time, with intensity that surges and
 *  ebbs, so the corruption never settles. */
function boil(): void {
  const surge = 3 + Math.round(4 + 3 * Math.sin(Date.now() / 700));
  zalgo.nodes.forEach((rec, node) => {
    if (!node.isConnected) { zalgo.nodes.delete(node); return; }
    if (node.nodeValue !== rec.mangled) return; // the app changed it; the observer handles that
    if (Math.random() < 0.25) return; // leave some still this time, so it flickers unevenly
    const extra = node.parentElement && node.parentElement.closest('#effects-tray') ? 3 : 0;
    rec.mangled = zalgoify(rec.orig, surge + extra);
    node.nodeValue = rec.mangled;
  });
}

/** Screen readers would read constantly changing text again and again, so live
 *  announcements in the corrupted areas pause until zalgo ends. */
function muteLiveRegions(): void {
  TARGETS.forEach((sel) => document.querySelectorAll<HTMLElement>(sel).forEach((root) => {
    [root, ...Array.from(root.querySelectorAll<HTMLElement>('[aria-live]'))].forEach((e) => {
      const live = e.getAttribute('aria-live');
      if (live && live !== 'off') { zalgo.muted.push([e, live]); e.setAttribute('aria-live', 'off'); }
    });
  }));
}
function unmuteLiveRegions(): void {
  zalgo.muted.forEach(([e, live]) => e.setAttribute('aria-live', live));
  zalgo.muted = [];
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
  muteLiveRegions();
  // Keep it boiling (with reduce motion on, the text is scrambled once and stays still).
  if (!reducedMotion()) zalgo.timer = setInterval(boil, BOIL_MS);
}

function stopZalgo(): void {
  if (!zalgo.active) return;
  zalgo.active = false;
  clearInterval(zalgo.timer);
  zalgo.timer = undefined;
  if (zalgo.observer) zalgo.observer.disconnect();
  zalgo.observer = null;
  zalgo.nodes.forEach((rec, node) => {
    // Only restore text we changed; if the app has since replaced it, leave that alone.
    if (node.isConnected && node.nodeValue === rec.mangled) node.nodeValue = rec.orig;
  });
  zalgo.nodes.clear();
  unmuteLiveRegions();
  document.body.classList.remove('fx-zalgo');
}

export function startZalgoEffect(): EffectControl {
  vibrate([30, 30, 30, 30, 30]);
  startZalgo();
  return { stop: stopZalgo };
}
