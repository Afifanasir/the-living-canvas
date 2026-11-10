// Where a painting hangs in its exhibit room, in screen pixels. Shared by the exhibit room and by the entry
// flip, so the flip lands exactly where the room then shows the painting.
//
// The exhibit rooms (public/rooms/exhibit-<wing>.webp, 16:9) cover the screen and are aligned to the gallery:
// the wall runs from the cornice (0.115 of the room's height) to the dado rail (0.70).

export type Rect = { x: number; y: number; w: number; h: number };
export type Hang = { painting: Rect; plate: Rect; frame: number; landscape: boolean };

const WALL_TOP = 0.115; // cornice
const RAIL = 0.695; // dado rail
/** The camera stands closer than the full wall (as in the gallery), so the painting gets more of the screen. */
export const ROOM_ZOOM = 1.18;
export const roomHeight = (W: number, H: number) => Math.max(H, ((W * 9) / 16) * ROOM_ZOOM);

/** The plate hangs in the wall panels' frame (carved moulding, then a band of wood); this is its width on both sides
 *  together, matching the clamp() values on the plate in components/ExhibitRoom.tsx. */
const clamp = (lo: number, v: number, hi: number) => Math.min(hi, Math.max(lo, v));
const panelChrome = (W: number) => 2 * (clamp(8, W * 0.008, 14) + clamp(7, W * 0.0075, 13));

export function hang(W: number, H: number, ratio: number): Hang {
  const rh = roomHeight(W, H);
  const oy = (H - rh) / 2;
  const top = oy + WALL_TOP * rh;
  const rail = oy + RAIL * rh;
  const frame = Math.round(Math.min(54, Math.max(16, Math.min(W, H) * 0.052)));
  const landscape = W / H >= 1.15;

  if (landscape) {
    const margin = Math.max(64, W * 0.06);
    const plateW = Math.min(540, Math.max(300, W * 0.29)) + panelChrome(W);
    const gap = Math.max(28, W * 0.028);
    const availW = W - 2 * margin - plateW - gap;
    // Equal clear wall above (to the cornice) and below (to the dado rail).
    const air = Math.max(16, (rail - top) * 0.045);
    const availH = rail - top - 2 * air;
    const ph = Math.min(availH - 2 * frame, (availW - 2 * frame) / ratio);
    const pw = ph * ratio;
    const groupW = pw + 2 * frame + gap + plateW;
    const gx = (W - groupW) / 2;
    const py = (top + rail) / 2 - ph / 2;
    const plateH = rail - top - 2 * air; // same clear wall above and below as the painting
    return {
      landscape,
      frame,
      painting: { x: gx + frame, y: py, w: pw, h: ph },
      plate: { x: gx + pw + 2 * frame + gap, y: Math.max(top, py + ph / 2 + frame / 2 - plateH / 2), w: plateW, h: plateH },
    };
  }

  // Portrait: the painting hangs on the upper wall, the plate below it.
  const margin = Math.max(20, W * 0.06);
  const availH = (rail - top) * 0.71;
  const ph = Math.min(availH - 2 * frame, (W - 2 * margin - 2 * frame) / ratio);
  const pw = ph * ratio;
  const py = top + frame + 8;
  const plateY = py + ph + frame + 18;
  return {
    landscape,
    frame,
    painting: { x: (W - pw) / 2, y: py, w: pw, h: ph },
    plate: { x: margin, y: plateY, w: W - 2 * margin, h: Math.max(160, H - plateY - 28) },
  };
}
