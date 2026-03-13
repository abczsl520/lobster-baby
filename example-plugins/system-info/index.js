module.exports = {
  activate(lobster) {
    lobster.menu.add({
      label: '📊 龙虾状态',
      onClick: () => {
        const s = lobster.status.get();
        const fmt = (n) => {
          if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
          if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
          return String(n);
        };
        const statusMap = { active: '🟢 活跃', idle: '💤 空闲', error: '🔴 离线' };
        const msg = `${statusMap[s.status] || s.status} | Lv.${s.level} | 今日 ${fmt(s.dailyTokens)} | 总计 ${fmt(s.totalTokens)}`;
        lobster.ui.toast(msg, 4000);
      },
    });
  },

  deactivate() {},
};
