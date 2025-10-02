// import axios from 'axios';
// import * as chromeLauncher from 'chrome-launcher';
// import create_proxy from './create_proxy.js';
// // import { Server } from "socket.io";
// import CDP from 'chrome-remote-interface';

// export default async function browser_launcher(external_user_info) {
//   try {
//     console.log('🚀 Launching browser...');
//     const chrome = await chromeLauncher.launch({
//       startingUrl: external_user_info.dashboardUrl,
//       chromeFlags: [
//         '--start-maximized',
//         '--remote-allow-origins=*',
//         '--enable-logging',
//         '--v=1',
//         '--disable-gpu',
//         // "--start-maximized",
//         // "--remote-allow-origins=*",
//         // "--enable-logging",
//         // "--disable-gpu",
//         // "--no-sandbox",
//         // "--disable-background-timer-throttling",
//         // "--disable-backgrounding-occluded-windows",
//         // "--disable-renderer-backgrounding",
//         // "--disable-features=CalculateNativeWinOcclusion",
//         // "--disable-ipc-flooding-protection",
//         // "--disable-hang-monitor",
//         // "--disable-popup-blocking",
//         // "--disable-client-side-phishing-detection",
//         // "--autoplay-policy=no-user-gesture-required",
//         // "--allow-running-insecure-content",
//         // "--mute-audio",
//         // "--window-size=1920,1080",
//         // "--force-device-scale-factor=1",
//         // "--disable-translate",
//         // "--silent-debugger-extension-api"
//         '--disable-http2',
//         '--enable-features=NetworkService,NetworkServiceInProcess',
//         '--disable-web-security',
//         '--disable-site-isolation-trials',
//       ],
//     });

//     const protocol = await CDP({
//       port: chrome.port,
//     });
//     const { Emulation } = protocol;
//     // const { DOM, Page, Emulation, Runtime, CSS } = protocol;
//     // await Promise.all([
//     //   DOM.enable(),
//     //   Page.enable(),
//     //   Runtime.enable(),
//     //   CSS.enable(),
//     // ]);

//     await Emulation.setFocusEmulationEnabled({ enabled: true });

//     console.log('✅ Getting browser info...');
//     const versionInfo = await axios.get(
//       `http://localhost:${chrome.port}/json/list`
//     );
//     const browserInfo = await axios.get(
//       `http://localhost:${chrome.port}/json/version`
//     );

//     console.log(browserInfo.data);
//     console.log(versionInfo.data);

//     const targets = versionInfo.data;

//     console.log(targets[0].devtoolsFrontendUrl);
//     const proxy_url = await create_proxy(
//       chrome.port,
//       targets[0].devtoolsFrontendUrl
//     );

//     console.log(`✅ Started Chrome on port ${chrome.port}`);

//     // WebSocket connection to Chrome Debugger

//     console.log(proxy_url);

//     return {
//       url: browserInfo.data.webSocketDebuggerUrl,
//       r_url: proxy_url,
//       port: chrome.port,
//     };
//   } catch (err) {
//     console.error('❌ Error in browser launcher:', err);
//   }
// }
