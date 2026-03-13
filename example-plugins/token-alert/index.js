module.exports = {
  activate(lobster) {
    // Default threshold: 100M tokens
    const threshold = lobster.config.get('threshold') || 100_000_000;
    const notifiedToday = lobster.config.get('notifiedDate');
    const today = new Date().toISOString().slice(0, 10);

    // Check every 60 seconds
    const interval = setInterval(() => {
      const status = lobster.status.get();
      const currentDate = new Date().toISOString().slice(0, 10);

      // Reset notification flag on new day
      if (lobster.config.get('notifiedDate') !== currentDate && status.dailyTokens >= threshold) {
        const formatted = (threshold / 1_000_000).toFixed(0) + 'M';
        lobster.notify(
          `今日已消耗 ${formatted} Token！`,
          { title: '🦞 Token 提醒' }
        );
        lobster.config.set('notifiedDate', currentDate);
        lobster.log(`Token alert triggered: daily=${status.dailyTokens}, threshold=${threshold}`);
      }
    }, 60_000);

    // Menu item to configure threshold
    lobster.menu.add({
      label: '⚙️ Token 提醒设置',
      onClick: () => {
        const current = lobster.config.get('threshold') || 100_000_000;
        const formatted = (current / 1_000_000).toFixed(0);
        // Cycle through presets: 50M → 100M → 200M → 500M → 1B → 50M
        const presets = [50_000_000, 100_000_000, 200_000_000, 500_000_000, 1_000_000_000];
        const idx = presets.indexOf(current);
        const next = presets[(idx + 1) % presets.length];
        lobster.config.set('threshold', next);
        const nextFormatted = next >= 1_000_000_000
          ? (next / 1_000_000_000).toFixed(0) + 'B'
          : (next / 1_000_000).toFixed(0) + 'M';
        lobster.ui.toast(`Token 提醒阈值: ${nextFormatted}`);
        lobster.log(`Threshold set to ${next}`);
      },
    });

    // Store interval for cleanup
    this._interval = interval;
  },

  deactivate() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  },
};
