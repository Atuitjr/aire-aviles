import type { Notifier, SourcePlugin } from "./types.ts";

/**
 * Registro central. Añadir una fuente nueva = registrarla aquí desde el worker;
 * el resto del sistema (guardado, episodios, avisos) no cambia.
 */
export class Registry {
  readonly sources = new Map<string, SourcePlugin>();
  readonly notifiers = new Map<string, Notifier>();

  addSource(source: SourcePlugin): this {
    if (this.sources.has(source.id)) throw new Error(`Fuente duplicada: ${source.id}`);
    this.sources.set(source.id, source);
    return this;
  }

  addNotifier(notifier: Notifier): this {
    this.notifiers.set(notifier.id, notifier);
    return this;
  }
}
