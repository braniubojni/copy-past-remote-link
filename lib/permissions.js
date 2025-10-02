/**
 * Permissions Manager
 * Handles clipboard and other browser permissions
 */

class PermissionsManager {
  constructor(Browser) {
    this.Browser = Browser;
  }

  /**
   * Grant permissions for a page target
   */
  async grantForTarget(pageTarget) {
    if (!pageTarget) return;

    await this.Browser.grantPermissions({
      origin: pageTarget.url,
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
    });
    console.log('✓ Clipboard permissions granted for:', pageTarget.url);
  }

  /**
   * Grant permissions for a specific origin URL
   */
  async grantForOrigin(url) {
    try {
      const origin = new URL(url).origin;
      await this.Browser.grantPermissions({
        origin: origin,
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      });
      console.log('✓ Clipboard permissions granted for origin:', origin);
    } catch (error) {
      console.log('⚠ Could not grant permissions:', error.message);
    }
  }
}

module.exports = PermissionsManager;
