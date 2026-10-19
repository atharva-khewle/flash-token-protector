// Service worker: one context-menu entry. Select a tx hash or address on any page,
// right-click, "Check with Flash Token Protector". The selection is validated by
// shape and handed to the popup page as a query string. Nothing is sent anywhere.

const MENU_ID = 'ftp-check'
const SHAPE = /^((0x)?[0-9a-fA-F]{64}|0x[0-9a-fA-F]{40}|T[1-9A-HJ-NP-Za-km-z]{33})$/

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Check selection with Flash Token Protector',
    contexts: ['selection'],
  })
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return
  const sel = (info.selectionText ?? '').replace(/\s+/g, '').slice(0, 200)
  if (!SHAPE.test(sel)) return
  void chrome.tabs.create({ url: chrome.runtime.getURL(`popup.html?q=${encodeURIComponent(sel)}`) })
})
