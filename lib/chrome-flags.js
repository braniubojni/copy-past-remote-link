/**
 * Chrome Flags Configuration
 * Centralized Chrome launch flags
 */

const CHROME_FLAGS = [
  '--no-sandbox',
  '--disable-gpu',
  '--enable-automation',
  '--start-maximized',
  '--disable-setuid-sandbox',
  '--disable-web-security',
  '--disable-features=IsolateOrigins,site-per-process,SitePerProcess,Translate',
  '--disable-site-isolation-trials',
  '--remote-allow-origins=*',
  '--enable-blink-features=ClipboardSupport',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--settings-window-size=1920,1080',
  '--disable-setuid-sandbox',
  '--disable-features=VizDisplayCompositor',
  '--allow-running-insecure-content',
  '--disable-web-security',
  '--disable-same-site-by-default-cookies',
  '--v=1',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-component-extensions-with-background-pages',
  '--disable-features=TranslateUI',
  '--disable-ipc-flooding-protection',
  '--disable-renderer-backgrounding',
  '--disable-sync',
  '--force-color-profile=srgb',
  '--hide-scrollbars',
  '--metrics-recording-only',
  '--mute-audio',
  '--disable-features=SameSiteByDefaultCookies',
  '--allow-running-insecure-content',
];

module.exports = CHROME_FLAGS;
