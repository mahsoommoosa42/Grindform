// Apply the saved theme before first paint to avoid a flash of the default
// theme. Kept as an external file (not inline) so the Content-Security-Policy
// can forbid inline scripts.
try {
  const saved = localStorage.getItem('gf-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
} catch (_) {
  /* localStorage may be unavailable; default theme stays. */
}
