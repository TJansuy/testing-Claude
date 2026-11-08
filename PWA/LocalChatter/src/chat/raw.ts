// The text each bubble was sent with, before any language gibberish or zalgo,
// for games that read what people wrote (the wall's word rules).
const raw = new WeakMap<HTMLElement, string>();
export const setRawText = (box: HTMLElement, text: string): void => { raw.set(box, text); };
export const rawText = (box: HTMLElement): string => raw.get(box) || '';
