/**
 * SSH IPC Handlers — server management, connection, remote commands
 */
import { ipcMain } from 'electron';
import { logError } from '../logger';
import { sshManager } from '../ssh-manager';

export function registerSSHIPC() {
  // Batch status check for all connected servers
  ipcMain.handle('ssh-batch-status', async () => {
    const servers = sshManager.getServers();
    const results: Record<string, any> = {};
    const promises = servers.map(async (s) => {
      if (!sshManager.isConnected(s.id)) {
        results[s.id] = { connected: false };
        return;
      }
      try {
        const [status, tokens] = await Promise.all([
          sshManager.getOpenClawStatus(s.id),
          sshManager.getRemoteTokens(s.id),
        ]);
        results[s.id] = { ...status, tokens };
      } catch {
        results[s.id] = { connected: false, error: 'Failed' };
      }
    });
    await Promise.all(promises);
    return results;
  });

  ipcMain.handle('ssh-get-servers', () => {
    return sshManager.getServers().map(s => ({
      ...s,
      encryptedCredential: undefined,
      isConnected: sshManager.isConnected(s.id),
    }));
  });

  ipcMain.handle('ssh-add-server', async (_event, data: {
    name: string; host: string; port: number; username: string;
    authType: 'password' | 'key'; credential: string;
  }) => {
    try {
      const server = sshManager.addServer({
        name: data.name, host: data.host, port: data.port || 22,
        username: data.username, authType: data.authType,
      }, data.credential);
      return { success: true, server: { ...server, encryptedCredential: undefined } };
    } catch (err: any) { return { error: err.message }; }
  });

  ipcMain.handle('ssh-remove-server', (_event, id: string) => {
    return { success: sshManager.removeServer(id) };
  });

  ipcMain.handle('ssh-connect', async (_event, id: string) => {
    return await sshManager.connect(id);
  });

  ipcMain.handle('ssh-disconnect', (_event, id: string) => {
    sshManager.disconnect(id);
    return { success: true };
  });

  // Rate limit test connections (max 3 per minute)
  let testConnectionAttempts: number[] = [];
  const TEST_RATE_LIMIT = 3;
  const TEST_RATE_WINDOW = 60000;

  ipcMain.handle('ssh-test-connection', async (_event, data: {
    host: string; port: number; username: string;
    authType: 'password' | 'key'; credential: string;
  }) => {
    const now = Date.now();
    testConnectionAttempts = testConnectionAttempts.filter(t => now - t < TEST_RATE_WINDOW);
    if (testConnectionAttempts.length >= TEST_RATE_LIMIT) {
      return { success: false, error: 'Too many test attempts. Please wait a moment.' };
    }
    testConnectionAttempts.push(now);

    if (!data.host || typeof data.host !== 'string' || data.host.length > 255) {
      return { success: false, error: 'Invalid host' };
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(data.host)) {
      return { success: false, error: 'Host contains invalid characters' };
    }

    const { Client: SSHClient } = require('ssh2');
    const client = new SSHClient();
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { client.end(); reject(new Error('Timeout')); }, 10000);
        client.on('ready', () => { clearTimeout(timeout); client.end(); resolve(); });
        client.on('error', (err: Error) => { clearTimeout(timeout); reject(err); });
        const config: any = {
          host: data.host, port: data.port || 22, username: data.username,
          readyTimeout: 10000,
        };
        if (data.authType === 'password') config.password = data.credential;
        else config.privateKey = data.credential;
        client.connect(config);
      });
      return { success: true };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('ssh-openclaw-status', async (_event, serverId: string) => {
    return await sshManager.getOpenClawStatus(serverId);
  });

  ipcMain.handle('ssh-remote-tokens', async (_event, serverId: string) => {
    return await sshManager.getRemoteTokens(serverId);
  });

  ipcMain.handle('ssh-process-list', async (_event, serverId: string) => {
    return await sshManager.getProcessList(serverId);
  });

  ipcMain.handle('ssh-system-info', async (_event, serverId: string) => {
    return await sshManager.getSystemInfo(serverId);
  });

  ipcMain.handle('ssh-process-logs', async (_event, serverId: string, processName: string, lines?: number) => {
    try {
      return { logs: await sshManager.getProcessLogs(serverId, processName, lines) };
    } catch (err: any) { return { error: err.message }; }
  });

  ipcMain.handle('ssh-restart-process', async (_event, serverId: string, processName: string) => {
    return await sshManager.restartProcess(serverId, processName);
  });

  ipcMain.handle('ssh-list-dir', async (_event, serverId: string, dirPath: string) => {
    if (typeof dirPath !== 'string' || dirPath.includes('..')) {
      return { error: 'Path traversal not allowed.' };
    }
    if (!/^\/opt\/apps\/[a-zA-Z0-9_-]+\/?$/.test(dirPath)) {
      return { error: 'Path not allowed. Only /opt/apps/<name>/ paths are accessible.' };
    }
    try {
      const result = await sshManager.exec(serverId, `ls -la ${dirPath}`);
      return { output: result.stdout, error: result.code !== 0 ? result.stderr : undefined };
    } catch (err: any) { return { error: err.message }; }
  });

  ipcMain.handle('ssh-read-file', async (_event, serverId: string, filePath: string) => {
    if (typeof filePath !== 'string' || filePath.includes('..')) {
      return { error: 'Path traversal not allowed.' };
    }
    if (!/^\/opt\/apps\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.(js|ts|json|md|txt|yml|yaml)$/.test(filePath)) {
      return { error: 'File path not allowed. No .env/.conf files, single directory depth only.' };
    }
    try {
      const result = await sshManager.exec(serverId, `cat ${filePath}`);
      return { content: result.stdout, error: result.code !== 0 ? result.stderr : undefined };
    } catch (err: any) { return { error: err.message }; }
  });
}
