// Emberline's look plan, in one place. Dusk in a freight yard: warm sand and rust
// against deep blue shade, one amber accent. The same names are the CSS custom
// properties in index.html, so the page and the scene never drift apart.
export const PALETTE = {
  canvas: '#191512',
  surface: '#241c14',
  hairline: '#3a2d1e',
  ink: '#f2e8d5',
  muted: '#a89a80',
  accent: '#ffb020',
  sand: '#b08d57',
  rust: '#a4552f',
  steel: '#55606e',
  teal: '#46c8b8',
  red: '#ff5a4e',
  sky: '#2b3247',
};

export function shade(name) {
  return PALETTE[name];
}
