// Thin keydown/keyup wrapper replacing Phaser's built-in keyboard plugin.
// justDown(code) mirrors Phaser.Input.Keyboard.JustDown semantics: true for
// exactly one frame after a key transitions up->down. Callers must invoke
// clearFrame() once per animation frame, after screens have had a chance to
// read justDown() for that frame (done centrally in main.ts's loop).
class KeyboardState {
  private down = new Set<string>();
  private justPressed = new Set<string>();

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (!this.down.has(e.code)) this.justPressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener("keyup", (e) => {
      this.down.delete(e.code);
    });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  justDown(code: string): boolean {
    return this.justPressed.has(code);
  }

  clearFrame() {
    this.justPressed.clear();
  }
}

export const keyboard = new KeyboardState();
