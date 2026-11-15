// Keyboard and pointer input. One-shot presses (confirm, pause, mute, tower
// hotkeys 1-4) are queued as flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. Pointer clicks
// are queued as field points; hover is tracked live for the range preview.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const HOTKEYS = { Digit1: 'worker', Digit2: 'soldier', Digit3: 'bomber', Digit4: 'guard' };

export function createInput(canvas, toField) {
  let actions = 0;
  let clicks = [];
  let hotkey = null;
  let hover = null;

  function fieldPoint(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return toField(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
  }

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (HOTKEYS[event.code]) {
      if (!event.repeat) hotkey = HOTKEYS[event.code];
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('blur', () => { hover = null; });
  canvas.addEventListener('pointermove', (event) => {
    hover = fieldPoint(event);
  });
  canvas.addEventListener('pointerdown', (event) => {
    const point = fieldPoint(event);
    if (point) clicks.push(point);
    event.preventDefault();
  });

  return {
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeClicks() {
      const taken = clicks;
      clicks = [];
      return taken;
    },
    takeHotkey() {
      const taken = hotkey;
      hotkey = null;
      return taken;
    },
    hover() {
      return hover;
    },
  };
}
