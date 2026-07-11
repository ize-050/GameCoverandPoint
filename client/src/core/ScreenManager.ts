// Replaces Phaser's Scene manager. Each screen is a single persistent
// instance (same pattern Phaser used internally) — mount()/unmount() do the
// setup/teardown work that Phaser's create()/shutdown-handler used to do,
// including unsubscribing any Colyseus listeners (see GameScreen) so they
// don't accumulate across repeated visits within one session.
export interface Screen {
  mount(data?: unknown): void;
  unmount(): void;
  update?(dt: number): void;
  resize?(width: number, height: number): void;
}

export type Navigate = (name: string, data?: unknown) => void;

export class ScreenManager {
  private screens = new Map<string, Screen>();
  private current: Screen | null = null;
  private currentName: string | null = null;

  register(name: string, screen: Screen) {
    this.screens.set(name, screen);
  }

  show(name: string, data?: unknown) {
    this.current?.unmount();
    const next = this.screens.get(name);
    if (!next) throw new Error(`Unknown screen: ${name}`);
    this.current = next;
    this.currentName = name;
    next.mount(data);
  }

  get activeName(): string | null {
    return this.currentName;
  }

  update(dt: number) {
    this.current?.update?.(dt);
  }

  resize(width: number, height: number) {
    this.current?.resize?.(width, height);
  }
}
