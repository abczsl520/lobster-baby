# Changelog

All notable changes to Lobster Baby.

## [1.9.0] - 2026-03-14

### Added
- 🌍 **i18n support** — Chinese/English with auto system language detection
- Language switcher in status panel settings
- `react-i18next` for renderer, custom lightweight `t()` helper for Electron main process
- Full translation coverage (~150+ keys) for all UI: status panel, achievements, speech bubbles, social, plugins, tray menu, notifications

### Changed
- Level names resolved lazily via `t()` instead of static map (fixes `app.getLocale()` timing issue)
- PK score displays plain number (removed locale-dependent `分` suffix)

## [1.8.0] - 2026-03-13

### Added
- 🧩 **Plugin system** — install, manage, and develop plugins
- Plugin engine with sandboxed API (`lobster.menu`, `lobster.ui`, `lobster.notify`, `lobster.shell`, `lobster.fetch`, `lobster.status`, `lobster.config`, `lobster.log`)
- Permission model: declared in manifest, checked per API call, user confirms on install
- Plugin UI panel (installed / store / import tabs)
- Right-click menu integration for plugins
- **[lbhub.ai](https://lbhub.ai)** — Plugin marketplace website
  - GitHub & Google OAuth login
  - Plugin upload, star/favorite, download tracking
  - Plugin detail pages with README/Files/Versions tabs
  - API documentation page
  - Personal center with profile editing
  - i18n support (zh-CN / English, auto-detect)

### Security
- Shell command blacklist, 30s timeout, 10KB stdout cap
- Path traversal prevention
- Private IP blocking in fetch
- HTTPS-only plugin downloads
- 50MB download limit
- Dangerous word filter on plugin content
- 10-round security audit completed

## [1.7.0] - 2026-03-12

### Added
- 🎯 **UX polish pass** — speech bubbles, level-up crossfade animation, combo click counter
- Leaderboard opt-in toggle ("参与排行榜")
- Code split: `main.ts` → `dock.ts`, `tray.ts`, `status.ts`, `social.ts` modules

### Fixed
- Feature card buttons (趋势/成就/社交) not responding — `??` vs `!== undefined` for boolean props
- `.gitignore` cleanup, removed double-click toggle

## [1.6.0] - 2026-03-11

### Added
- 🌐 **Social features** — registration, leaderboard, PK battles
- Lobster ID system (LB-000001 format)
- 4 leaderboard types: Token / Level / Streak / Achievements
- PK battle with 6-digit codes, 100-point scoring
- Anti-cheat: rate limiting, anomaly detection, server-side level calculation
- Privacy protection: minimal data collection, no IP/file/conversation tracking

### Security
- B-level anti-cheat system
- Anomaly database and middleware

## [1.5.0] - 2026-03-10

### Added
- 🖱️ **Edge docking** — drag to screen edge, auto-dock with custom hanging animations
- Custom dock sprites per level (AI-generated)
- Achievement list panel

## [1.4.0] - 2026-03-09

### Added
- 🏆 **Achievement system** — Token milestone unlocks with popup notifications
- 📈 **Trend charts** — daily token consumption visualization
- 10-level skin system with AI-generated sprites
- Auto-update checker
