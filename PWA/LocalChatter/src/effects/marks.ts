// Marks effects leave on message bubbles for good: charred by fire, shocked
// (an uneven, frazzled outline) by lightning, and soggy (sagging like wet
// paper) by rain. They stay after the effect ends.

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** Fire: the bubble is scorched. */
export function char(box: HTMLElement): void {
  box.classList.add('charred');
}

/** Lightning: a jagged, uneven outline that gets rougher with each hit (up to 3). */
export function shock(box: HTMLElement): void {
  const hits = Math.min(3, Number(box.dataset.shocks || 0) + 1);
  box.dataset.shocks = String(hits);
  const depth = 1.5 + hits * 1.5; // px the edge bites in
  const bite = (): string => rnd(0, depth).toFixed(1) + 'px';
  const pts: string[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) pts.push((i / n * 100).toFixed(1) + '% ' + (i % 2 ? bite() : '0px'));
  for (let i = 1; i <= n / 2; i++) pts.push('calc(100% - ' + (i % 2 ? bite() : '0px') + ') ' + (i / (n / 2) * 100).toFixed(1) + '%');
  for (let i = n - 1; i >= 0; i--) pts.push((i / n * 100).toFixed(1) + '% calc(100% - ' + (i % 2 ? bite() : '0px') + ')');
  for (let i = n / 2 - 1; i > 0; i--) pts.push((i % 2 ? bite() : '0px') + ' ' + (i / (n / 2) * 100).toFixed(1) + '%');
  box.style.setProperty('--shock-clip', 'polygon(' + pts.join(', ') + ')');
  box.style.setProperty('--shock-tilt', (rnd(0.6, 1.4) * hits * (Math.random() < 0.5 ? -1 : 1)).toFixed(2) + 'deg');
  // Uneven corners, as if the bubble was bent out of shape.
  const r = (): string => Math.round(rnd(2, 24)) + 'px';
  box.style.setProperty('--shock-radius', r() + ' ' + r() + ' ' + r() + ' ' + r());
  box.classList.add('shocked');
}

/** Rain: the bubble soaks up water and sags. Returns true once it's soggy. */
const wetness = new WeakMap<HTMLElement, number>();
export function wet(box: HTMLElement, amount = 1): boolean {
  const w = (wetness.get(box) || 0) + amount;
  wetness.set(box, w);
  if (w >= 5 && !box.classList.contains('soggy')) {
    box.style.setProperty('--sog-x', rnd(-16, -9).toFixed(1) + 'deg'); // the bottom sinks away, like wet paper
    box.style.setProperty('--sog-y', rnd(-7, 7).toFixed(1) + 'deg');
    box.style.setProperty('--sog-r', rnd(-2, 2).toFixed(1) + 'deg');
    box.classList.add('soggy');
  }
  return box.classList.contains('soggy');
}
