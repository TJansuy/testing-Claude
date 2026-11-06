// Small DOM helpers.

/** Looks up an element by id (the page always has it). */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, text?: string | null): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export const input = (id: string): HTMLInputElement => $<HTMLInputElement>(id);
export const select = (id: string): HTMLSelectElement => $<HTMLSelectElement>(id);
export const button = (id: string): HTMLButtonElement => $<HTMLButtonElement>(id);
