const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function notarize(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const zipPath = path.join(appOutDir, `${appName}-notarize.zip`);

  console.log(`📦 Zipping ${appPath} for notarization...`);
  execSync(`ditto -c -k --keepParent "${appPath}" "${zipPath}"`, { stdio: 'inherit' });

  console.log(`🔏 Submitting to Apple for notarization...`);
  try {
    execSync(
      `xcrun notarytool submit "${zipPath}" --keychain-profile "lobster-baby-notarize" --wait`,
      { stdio: 'inherit', timeout: 600_000 }
    );

    console.log('📎 Stapling notarization ticket...');
    execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'inherit' });

    console.log('✅ Notarization complete!');
  } catch (err) {
    console.error('❌ Notarization failed:', err.message);
    throw err;
  } finally {
    // Clean up temp zip
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  }
};
