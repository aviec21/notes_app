// Applies the saved theme before the first paint, to avoid a light/dark flash.
// (A separate file rather than an inline script, so the page's security policy can forbid
// all inline scripts.)
try {
  var t = localStorage.getItem('notes.theme')
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
} catch {}
