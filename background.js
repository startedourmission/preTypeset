'use strict';

const CONTENT_FILES = [
  'lib/zip.js',
  'lib/idml.js',
  'lib/docs-source.js',
  'lib/style-css.js',
  'lib/defaults.js',
  'lib/layout.js',
  'content/main.js'
];

function flashBadge(tabId, text) {
  chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 2500);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  if (!/^https:\/\/docs\.google\.com\/document\//.test(tab.url || '')) {
    flashBadge(tab.id, 'Docs');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'pt-toggle' });
  } catch (e) {
    // 확장 설치 전에 열려 있던 탭: 콘텐츠 스크립트를 주입한 뒤 다시 토글한다.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_FILES });
      await chrome.tabs.sendMessage(tab.id, { type: 'pt-toggle' });
    } catch (err) {
      flashBadge(tab.id, '!');
    }
  }
});
