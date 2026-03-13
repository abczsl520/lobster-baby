module.exports = {
  activate(lobster) {
    lobster.menu.add({
      label: '🔄 重启 OpenClaw',
      onClick: async () => {
        lobster.ui.toast('正在重启 OpenClaw...');
        lobster.log('Restarting OpenClaw gateway');

        const result = await lobster.shell.exec('openclaw gateway restart');

        if (result.code === 0) {
          lobster.notify('OpenClaw 已重启 ✅', { title: '🦞 重启成功' });
          lobster.ui.toast('OpenClaw 重启成功 ✅');
        } else {
          lobster.notify(`重启失败: ${result.stderr.slice(0, 100)}`, { title: '🦞 重启失败' });
          lobster.ui.toast('OpenClaw 重启失败 ❌');
        }

        lobster.log(`Restart result: code=${result.code}`);
      },
    });
  },

  deactivate() {},
};
