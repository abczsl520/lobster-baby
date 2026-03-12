// Window sizes
export const WINDOW_SIZE = {
  NORMAL: { width: 200, height: 250 },
  PANEL: { width: 320, height: 450 },
} as const;

// Snapping
export const SNAP = {
  DISTANCE: 15,
  MAGNETIC_DISTANCE: 30,
  MAGNETIC_STRENGTH: 0.3,
} as const;

// Drag
export const DRAG = {
  THRESHOLD: 5, // px to start dragging
  DEBOUNCE: 500, // ms to save position
} as const;

// Status check
export const STATUS_CHECK = {
  INTERVAL: 5000, // ms
  TIMEOUT: 8000, // ms
  RECENT_ACTIVITY_THRESHOLD: 30000, // ms
} as const;

// Animation
export const ANIMATION = {
  CLICK_DURATION: 500, // ms
  EMOJI_DURATION: 1800, // ms
} as const;

// Level thresholds (real API tokens including cache)
// Based on typical OpenClaw user ~100M/day
// Casual ~30M/day | Regular ~100M/day | Power ~500M/day
export const LEVEL_THRESHOLDS = [
  0,                 // Level 1: newborn
  50_000_000,        // Level 2: 50M  (regular: ~12h)
  200_000_000,       // Level 3: 200M (regular: ~2d)
  500_000_000,       // Level 4: 500M (regular: ~5d)
  1_000_000_000,     // Level 5: 1B   (regular: ~1.5w)
  2_500_000_000,     // Level 6: 2.5B (regular: ~3.5w)
  5_000_000_000,     // Level 7: 5B   (regular: ~1.7mo)
  10_000_000_000,    // Level 8: 10B  (regular: ~3.3mo)
  25_000_000_000,    // Level 9: 25B  (regular: ~8mo)
  50_000_000_000,    // Level 10: 50B (regular: ~1.4yr, legendary!)
] as const;
