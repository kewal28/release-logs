/**
 * Minimal embed helper: opens the public changelog for a project in a new tab.
 * Full in-page widget UI can extend this later.
 *
 *   <script src="https://your-host/js/widget.js"></script>
 *   <script>
 *     ReleaseWidget.init({ projectKey: 'YOUR_PUBLIC_KEY', triggerId: 'releases-btn', baseUrl: 'https://your-host' });
 *   </script>
 */
(function (global) {
  const ReleaseWidget = {
    init(opts) {
      if (!opts || !opts.projectKey) {
        console.warn('ReleaseWidget.init: projectKey is required');
        return;
      }
      const base = (opts.baseUrl || '').replace(/\/$/, '');
      const url = `${base}/?projectKey=${encodeURIComponent(opts.projectKey)}`;
      const open = () => window.open(url, '_blank', 'noopener,noreferrer');
      if (opts.triggerId) {
        const el = document.getElementById(opts.triggerId);
        if (el) el.addEventListener('click', open);
      }
    }
  };
  global.ReleaseWidget = ReleaseWidget;
})(typeof window !== 'undefined' ? window : globalThis);
