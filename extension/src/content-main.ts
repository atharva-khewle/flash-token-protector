// Runs in the page's own JavaScript world (manifest "world": "MAIN").
// Explorer and exchange "copy" buttons call navigator.clipboard.writeText, which an isolated
// content script cannot see. This only reports the copied text back to content-guard.ts.
// A hostile page can post fake messages, but the worst that does is a false warning.

const proto = typeof Clipboard !== 'undefined' ? Clipboard.prototype : null
const original = proto?.writeText

if (proto && original) {
  proto.writeText = function (this: Clipboard, text: string): Promise<void> {
    try {
      window.postMessage({ __ftp: 'copy', text: String(text).slice(0, 200) }, window.location.origin)
    } catch {
      /* never break the page's own copy button */
    }
    return original.call(this, text)
  }
}
