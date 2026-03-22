const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function notarize(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  // Skip notarization in CI if Apple credentials are not configured
  if (process.env.CI && !process.env.APPLE_ID) {
    console.log('⏭️ Skipping notarization in CI (APPLE_ID not set)');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const zipPath = path.join(appOutDir, `${appName}-notarize.zip`);

  console.log(`📦 Zipping ${appPath} for notarization...`);
  execSync(`ditto -c -k --keepParent "${appPath}" "${zipPath}"`, { stdio: 'inherit' });

  console.log(`🔏 Submitting to Apple for notarization...`);
  try {
    // Use environment variables in CI, keychain profile locally
    if (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) {
      execSync(
        `xcrun notarytool submit "${zipPath}" --apple-id "${process.env.APPLE_ID}" --password "${process.env.APPLE_APP_SPECIFIC_PASSWORD}" --team-id "${process.env.APPLE_TEAM_ID}" --wait`,
        { stdio: 'inherit', timeout: 600_000 }
      );
    } else {
      execSync(
        `xcrun notarytool submit "${zipPath}" --keychain-profile "lobster-baby-notarize" --wait`,
        { stdio: 'inherit', timeout: 600_000 }
      );
    }

    console.log('📎 Stapling notarization ticket...');
    execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'inherit' });

    console.log('✅ Notarization complete!');
  } catch (err) {
    console.error('❌ Notarization failed:', err.message);
    throw err;
  } finally {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  }
};
