/**
 * Plugin IPC Handlers
 */
import { ipcMain } from 'electron';
import { logError } from '../logger';
import * as plugins from '../plugins';

export function registerPluginIPC() {
  ipcMain.handle('plugin-list', () => plugins.getInstalledPlugins());
  ipcMain.handle('plugin-enable', async (_event, id: string) => plugins.enablePlugin(id));
  ipcMain.handle('plugin-disable', async (_event, id: string) => plugins.disablePlugin(id));
  ipcMain.handle('plugin-uninstall', async (_event, id: string) => plugins.uninstallPlugin(id));
  ipcMain.handle('plugin-install-url', async (_event, url: string) => plugins.installFromUrl(url));
  ipcMain.handle('plugin-featured', async () => plugins.fetchFeaturedPlugins());
  ipcMain.handle('plugin-search', async (_event, query: string) => plugins.searchPlugins(query));
  ipcMain.handle('plugin-menu-items', () => {
    return plugins.getMenuItems().map(m => ({ id: m.id, label: m.label, pluginId: m.pluginId }));
  });
  ipcMain.handle('plugin-menu-click', async (_event, menuId: string) => {
    const item = plugins.getMenuItems().find(m => m.id === menuId);
    if (item) { try { await item.onClick(); } catch (e) { logError(`Plugin menu click error: ${e}`); } }
  });
}
