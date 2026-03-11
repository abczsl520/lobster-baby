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

// Level thresholds (tokens)
export const LEVEL_THRESHOLDS = [
  0,           // Level 1
  10_000_000,  // Level 2: 10M
  50_000_000,  // Level 3: 50M
  150_000_000, // Level 4: 150M
  350_000_000, // Level 5: 350M
  700_000_000, // Level 6: 700M
  1_300_000_000, // Level 7: 1.3B
  2_200_000_000, // Level 8: 2.2B
  3_500_000_000, // Level 9: 3.5B
  5_000_000_000, // Level 10: 5B
] as const;
