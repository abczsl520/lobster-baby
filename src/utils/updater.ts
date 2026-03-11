export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
}

export async function checkForUpdates(currentVersion: string): Promise<UpdateInfo> {
  try {
    const response = await fetch('https://api.github.com/repos/abczsl520/lobster-baby/releases/latest');
    if (!response.ok) {
      return { hasUpdate: false, latestVersion: currentVersion, downloadUrl: '', releaseNotes: '' };
    }

    const data = await response.json();
    const latestVersion = data.tag_name.replace(/^v/, ''); // Remove 'v' prefix
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    return {
      hasUpdate,
      latestVersion,
      downloadUrl: data.html_url,
      releaseNotes: data.body || '',
    };
  } catch (error) {
    console.error('Failed to check for updates:', error);
    return { hasUpdate: false, latestVersion: currentVersion, downloadUrl: '', releaseNotes: '' };
  }
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}
