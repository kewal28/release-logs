/**
 * Embed widget: opens a right/left side drawer with an iframe
 * pointing at the project's public changelog.
 *
 * Example:
 *   <script src="https://cdn.yourdomain.com/widget.js"></script>
 *   <script>
 *     ReleaseWidget.init({ projectId: "abc123", triggerId: "release-btn", position: "right" });
 *   </script>
 */
(function (global) {
  const STYLE_ID = 'release-widget-style-v1';
  const ROOT_ID = 'release-widget-root-v1';

  function inferBaseUrlFromScript() {
    try {
      const s = document.currentScript;
      if (s && s.src) return new URL(s.src, window.location.href).origin;
    } catch (_) {}
    try {
      const scripts = document.getElementsByTagName('script');
      for (let i = scripts.length - 1; i >= 0; i--) {
        const src = scripts[i] && scripts[i].src;
        if (src) return new URL(src, window.location.href).origin;
      }
    } catch (_) {}
    return window.location.origin;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      .rw-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.42);
        z-index: 2147483000;
        opacity: 0;
        pointer-events: none;
        transition: opacity 140ms ease-out;
      }
      .rw-overlay.rw-open {
        opacity: 1;
        pointer-events: auto;
      }
      .rw-drawer {
        position: fixed;
        top: 0;
        bottom: 0;
        width: min(440px, 94vw);
        background: #f9fafb;
        z-index: 2147483001;
        box-shadow: 0 24px 80px rgba(0,0,0,.28);
        transform: translateX(110%);
        transition: transform 200ms cubic-bezier(.4,0,.2,1);
        display: flex;
        flex-direction: column;
        border-left: 1px solid rgba(0,0,0,.08);
      }
      .rw-drawer.rw-left {
        left: 0;
        right: auto;
        transform: translateX(-110%);
        border-left: none;
        border-right: 1px solid rgba(0,0,0,.08);
      }
      .rw-drawer.rw-right { right: 0; left: auto; }
      .rw-drawer.rw-open.rw-right,
      .rw-drawer.rw-open.rw-left { transform: translateX(0); }
      .rw-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        background: #fff;
        border-bottom: 1px solid rgba(0,0,0,.08);
        flex-shrink: 0;
      }
      .rw-body {
        padding: 14px 14px 0 14px;
        overflow-y: auto;
        flex: 1;
        background: #f9fafb;
      }
      .rw-footer {
        flex-shrink: 0;
        background: #fff;
        border-top: 1px solid rgba(0,0,0,.08);
        padding: 12px 14px;
      }
      .rw-muted { color: #6b7280; font: 500 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
      .rw-item {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 14px;
        padding: 14px;
        margin: 0 0 10px 0;
        background: #fff;
        transition: box-shadow 120ms;
      }
      .rw-item:hover { box-shadow: 0 4px 16px rgba(0,0,0,.08); }
      .rw-item-title {
        margin: 0 0 4px 0;
        font: 700 13px/1.3 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        color: #111827;
      }
      .rw-item-meta {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        margin-top: 8px;
        font: 600 11px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        color: #6b7280;
      }
      .rw-pill {
        display: inline-flex;
        align-items: center;
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid rgba(0,0,0,.08);
        background: rgba(17,24,39,.04);
        color: #374151;
        font: 700 10px/1 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        text-transform: capitalize;
        letter-spacing: .3px;
      }
      .rw-pill-feature { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
      .rw-pill-bug     { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
      .rw-pill-upcoming{ background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
      .rw-vote-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid rgba(0,0,0,.1);
        background: #fff;
        cursor: pointer;
        font: 700 11px/1 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        color: #374151;
        transition: background 100ms;
      }
      .rw-vote-btn:hover { background: #f3f4f6; }
      .rw-vote-btn.rw-voted-up   { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
      .rw-vote-btn.rw-voted-down { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
      .rw-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px solid rgba(0,0,0,.12);
        background: #fff;
        cursor: pointer;
        text-decoration: none;
        color: #111827;
        font: 700 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        transition: background 100ms;
      }
      .rw-link:hover { background: #f3f4f6; }
      .rw-title {
        font: 700 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        color: #111827;
        margin: 0;
      }
      .rw-close {
        width: 32px; height: 32px;
        border-radius: 10px;
        border: 1px solid rgba(0,0,0,.12);
        background: #fff;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #6b7280;
        font: 700 18px/1 system-ui;
        transition: background 100ms;
      }
      .rw-close:hover { background: #f3f4f6; color: #111827; }
    `;
    document.head.appendChild(s);
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = ROOT_ID;
    document.body.appendChild(root);
    return root;
  }

  function buildUI(position, titleText) {
    ensureStyle();
    const root = ensureRoot();
    root.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.className = 'rw-overlay';

    const drawer = document.createElement('div');
    drawer.className = `rw-drawer ${position === 'left' ? 'rw-left' : 'rw-right'}`;

    const header = document.createElement('div');
    header.className = 'rw-header';

    const title = document.createElement('div');
    title.className = 'rw-title';
    title.textContent = titleText || 'Release log';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'rw-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&times;';

    const body = document.createElement('div');
    body.className = 'rw-body';

    const footer = document.createElement('div');
    footer.className = 'rw-footer';
    footer.style.display = 'none';

    header.appendChild(title);
    header.appendChild(closeBtn);
    drawer.appendChild(header);
    drawer.appendChild(body);
    drawer.appendChild(footer);
    root.appendChild(overlay);
    root.appendChild(drawer);

    return { overlay, drawer, body, footer, closeBtn, titleEl: title };
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripHtml(str) {
    return String(str || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function bodyToHtml(body) {
    const s = String(body || '');
    if (/[<>]/.test(s)) return s;
    return escapeHtml(s).replace(/\n/g, '<br/>');
  }

  function humanDate(raw) {
    if (!raw) return '';
    try {
      const d = new Date(String(raw));
      if (isNaN(d)) return String(raw).slice(0, 10);
      const now = new Date();
      const diff = Math.floor((now - d) / 1000);
      if (diff < 60) return 'just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    } catch (_) {
      return String(raw).slice(0, 10);
    }
  }

  function pillClass(label) {
    const l = String(label || '').toLowerCase();
    if (l === 'feature') return 'rw-pill rw-pill-feature';
    if (l === 'bug') return 'rw-pill rw-pill-bug';
    if (l === 'upcoming') return 'rw-pill rw-pill-upcoming';
    return 'rw-pill';
  }

  function getCookie(name) {
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch (_) { return ''; }
  }

  function setCookie(name, value, maxAgeSeconds) {
    const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `Max-Age=${maxAgeSeconds || 31536000}`, 'SameSite=Lax'];
    if (location.protocol === 'https:') parts.push('Secure');
    document.cookie = parts.join('; ');
  }

  function loadIdentity() {
    const raw = getCookie('rw_identity');
    if (!raw) return { name: '', email: '' };
    try {
      const obj = JSON.parse(atob(raw));
      return { name: String(obj.name || ''), email: String(obj.email || '') };
    } catch (_) { return { name: '', email: '' }; }
  }

  function saveIdentity(name, email) {
    const payload = btoa(JSON.stringify({ name: String(name || ''), email: String(email || '') }));
    setCookie('rw_identity', payload, 31536000);
  }

  async function fetchJson(url) {
    const res = await fetch(url, { credentials: 'omit' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  const ReleaseWidget = {
    init(opts) {
      if (!opts) { console.warn('ReleaseWidget.init: options are required'); return; }
      const projectKey = opts.projectKey || opts.projectId;
      if (!projectKey) { console.warn('ReleaseWidget.init: projectId (or projectKey) is required'); return; }

      const base = String(opts.baseUrl || '').trim().replace(/\/$/, '') || inferBaseUrlFromScript();
      const apiBase = String(opts.apiBaseUrl || '').trim().replace(/\/$/, '') || base;
      const position = String(opts.position || 'right').toLowerCase() === 'left' ? 'left' : 'right';
      const { overlay, drawer, body, footer, closeBtn, titleEl } = buildUI(position, opts.title);

      let isOpen = false;
      let loadedOnce = false;
      const locale = opts.locale ? String(opts.locale) : '';
      let labelCountsCache = null;
      let activeLabel = '';
      let listCache = [];
      let selectedId = null;
      let replyParentId = null;
      let identity = loadIdentity();
      let currentChangelogId = null;

      // ── Extra styles (injected once) ────────────────────────────────────
      const ensureExtraStyles = () => {
        if (document.getElementById('rw-extra-style-v1')) return;
        const s = document.createElement('style');
        s.id = 'rw-extra-style-v1';
        s.textContent = `
          .rw-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px 0}
          .rw-tab{border:1px solid rgba(0,0,0,.12);background:#fff;border-radius:999px;padding:5px 10px;cursor:pointer;font:700 11px/1 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#374151;text-transform:capitalize;transition:background 100ms}
          .rw-tab.rw-active{background:#111827;color:#fff;border-color:#111827}
          .rw-card{cursor:pointer}
          .rw-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
          .rw-chevron{color:#9ca3af;font:900 14px/1 system-ui;flex-shrink:0;margin-top:1px}
          .rw-detail-title{font:800 15px/1.3 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;margin:0 0 6px 0;color:#111827}
          .rw-body-html{font:400 13px/1.6 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#374151;margin-top:12px}
          .rw-body-html p{margin:0 0 10px 0}
          .rw-body-html ul,.rw-body-html ol{margin:0 0 10px 20px}
          .rw-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center;gap:10px}
          .rw-empty-icon{font-size:36px;line-height:1}
          .rw-empty-title{font:700 15px/1.3 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#111827;margin:0}
          .rw-empty-desc{font:400 13px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#6b7280;margin:0;max-width:220px}
          .rw-comments-section{margin-top:16px;border-top:1px solid rgba(0,0,0,.08);padding-top:14px}
          .rw-comment{padding:10px 12px;border-radius:10px;margin-bottom:6px;background:#f9fafb}
          .rw-comment-admin{background:#eef2ff;border-left:3px solid #4f46e5}
          .rw-comment-reply{margin-left:20px;border-left:2px solid rgba(0,0,0,.06);padding-left:10px;background:#fff}
          .rw-reply-hint{display:flex;align-items:center;justify-content:space-between;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:6px 10px;margin-bottom:8px;font:600 11px/1.4 system-ui;color:#1d4ed8}
          .rw-identity-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
          .rw-anon-name{font:700 12px/1 system-ui;color:#374151}
          .rw-set-name-link{font:600 11px/1 system-ui;color:#6366f1;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
          .rw-name-form{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
          .rw-field{width:100%;padding:9px 10px;border-radius:9px;border:1px solid rgba(0,0,0,.14);font:500 12px/1.2 system-ui;background:#fff;box-sizing:border-box}
          .rw-field:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.15)}
          .rw-textarea{min-height:72px;resize:vertical}
          .rw-send{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:9px;border:none;background:#111827;color:#fff;cursor:pointer;font:700 12px/1 system-ui}
          .rw-send:disabled{opacity:.5;cursor:not-allowed}
          .rw-send-row{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:8px}
          .rw-back{display:inline-flex;align-items:center;gap:6px;margin:0 0 10px 0}
        `;
        document.head.appendChild(s);
      };

      // ── Helpers ────────────────────────────────────────────────────────
      function nestCommentsFlat(flat) {
        const list = Array.isArray(flat) ? flat.slice() : [];
        const roots = list.filter(c => c.parent_id == null)
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const out = [];
        function walk(node, depth) {
          out.push({ ...node, depth });
          list.filter(c => Number(c.parent_id) === Number(node.id))
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .forEach(k => walk(k, depth + 1));
        }
        roots.forEach(r => walk(r, 0));
        return out;
      }

      const renderLoading = () => {
        body.innerHTML = `<div class="rw-muted" style="padding:20px 0">Loading…</div>`;
        footer.style.display = 'none';
      };

      const renderError = (msg) => {
        body.innerHTML = `<div class="rw-muted" style="padding:20px 0">${escapeHtml(msg)}</div>`;
        footer.style.display = 'none';
      };

      // ── Tabs ───────────────────────────────────────────────────────────
      const renderTabs = (counts) => {
        const labels = Object.keys(counts || {}).filter(k => (counts[k] || 0) > 0);
        const order = ['feature', 'bug', 'upcoming'];
        labels.sort((a, b) => {
          const ai = order.indexOf(a), bi = order.indexOf(b);
          if (ai === -1 && bi === -1) return a.localeCompare(b);
          if (ai === -1) return 1; if (bi === -1) return -1;
          return ai - bi;
        });
        if (!labels.length) return '';
        const all = `<button type="button" class="rw-tab ${!activeLabel ? 'rw-active' : ''}" data-action="tab" data-label="">All</button>`;
        const tabs = labels.map(l =>
          `<button type="button" class="rw-tab ${l === activeLabel ? 'rw-active' : ''}" data-action="tab" data-label="${escapeHtml(l)}">${escapeHtml(l)}</button>`
        ).join('');
        return `<div class="rw-tabs">${all}${tabs}</div>`;
      };

      // ── List view ─────────────────────────────────────────────────────
      const renderList = (items) => {
        ensureExtraStyles();
        footer.style.display = 'none';
        const tabs = labelCountsCache ? renderTabs(labelCountsCache) : '';
        if (!items || !items.length) {
          body.innerHTML = `${tabs}<div class="rw-empty-state">
            <div class="rw-empty-icon">🚀</div>
            <p class="rw-empty-title">Nothing here yet</p>
            <p class="rw-empty-desc">Release notes will show up here once the team publishes an update.</p>
          </div>`;
          return;
        }
        body.innerHTML = tabs + items.map(c => {
          const label = c.label || '';
          const date = humanDate(c.release_date || c.published_at || c.created_at);
          const summary = escapeHtml(stripHtml(c.body).slice(0, 160));
          const ups = Number(c.upvotes) || 0;
          const cms = Number(c.comments) || 0;
          return `
          <div class="rw-item rw-card" role="button" tabindex="0" data-action="open" data-id="${escapeHtml(c.id)}">
            <div class="rw-card-head">
              <div style="min-width:0;flex:1">
                ${label ? `<span class="${pillClass(label)}" style="margin-bottom:6px;display:inline-flex">${escapeHtml(label)}</span>` : ''}
                <div class="rw-item-title">${escapeHtml(c.title)}</div>
                <div class="rw-muted" style="margin-top:3px">${summary}</div>
              </div>
              <span class="rw-chevron" aria-hidden="true">›</span>
            </div>
            <div class="rw-item-meta" style="margin-top:10px">
              ${date ? `<span style="display:flex;align-items:center;gap:3px">🕐 ${date}</span>` : ''}
              ${ups ? `<span>👍 ${ups}</span>` : ''}
              ${cms ? `<span>💬 ${cms}</span>` : ''}
            </div>
          </div>`;
        }).join('');
      };

      // ── Comment footer form ────────────────────────────────────────────
      function renderCommentFooter(changelogId) {
        currentChangelogId = changelogId;
        const displayName = identity.name || 'Anonymous';
        footer.style.display = 'block';
        footer.innerHTML = `
          <div id="rwReplyHint" class="rw-reply-hint" style="display:none">
            <span id="rwReplyHintText">Replying to comment</span>
            <button type="button" data-action="cancel-reply" style="border:none;background:none;cursor:pointer;font:700 11px/1 system-ui;color:#6b7280">✕ Cancel</button>
          </div>
          <textarea class="rw-field rw-textarea" id="rwComment" placeholder="Write a comment…"></textarea>
          <div class="rw-send-row">
            <div class="rw-identity-row" style="margin-bottom:0">
              <span class="rw-anon-name" id="rwDisplayName">${escapeHtml(displayName)}</span>
              <span class="rw-set-name-link" data-action="set-name">${identity.name ? '✎ edit' : 'Set your name'}</span>
            </div>
            <button type="button" class="rw-send" id="rwSend" data-action="send" data-id="${escapeHtml(changelogId)}">
              Send ↑
            </button>
          </div>
          <div id="rwNameForm" style="display:none;margin-top:8px" class="rw-name-form">
            <input class="rw-field" id="rwName" placeholder="Your name (optional)" value="${escapeHtml(identity.name)}" style="flex:1;min-width:120px"/>
            <input class="rw-field" id="rwEmail" placeholder="Email (optional)" value="${escapeHtml(identity.email)}" style="flex:1;min-width:120px"/>
            <button type="button" class="rw-send" data-action="save-name" style="white-space:nowrap">Save</button>
          </div>`;
      }

      // ── Detail view ────────────────────────────────────────────────────
      const renderDetail = (c) => {
        ensureExtraStyles();
        const label = c.label || '';
        const date = humanDate(c.release_date || c.published_at || c.created_at);
        const bodyHtml = bodyToHtml(c.body);
        replyParentId = null;
        const nested = nestCommentsFlat(c.comments_list || []);

        const comments = nested.map(cm => {
          const who = escapeHtml(cm.author_name || 'Anonymous');
          const when = humanDate(cm.created_at);
          const content = escapeHtml(cm.content || '').replace(/\n/g, '<br/>');
          const isAdmin = Number(cm.author_is_admin) === 1;
          const adminCls = isAdmin ? ' rw-comment-admin' : '';
          const replyCls = cm.depth ? ' rw-comment-reply' : '';
          const badge = isAdmin ? `<span style="font:800 9px/1 system-ui;color:#4f46e5;text-transform:uppercase;background:#eef2ff;padding:1px 5px;border-radius:4px;margin-left:4px">admin</span>` : '';
          const ml = cm.depth ? `margin-left:${Math.min(cm.depth, 3) * 16}px` : '';
          return `<div class="rw-comment${adminCls}${replyCls}" style="${ml}">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">
              <strong style="font:700 12px/1 system-ui;color:#111827">${who}</strong>${badge}
              <span class="rw-muted">${when}</span>
              <button type="button" style="margin-left:auto;border:none;background:none;color:#6366f1;font:600 11px/1 system-ui;cursor:pointer;padding:0" data-action="reply-comment" data-parent="${cm.id}" data-name="${escapeHtml(cm.author_name || 'Anonymous')}">↩ Reply</button>
            </div>
            <div style="font:400 12px/1.55 system-ui;color:#374151">${content}</div>
          </div>`;
        }).join('');

        const ups = Number(c.upvotes) || Number(c.upvote_count) || 0;
        const downs = Number(c.downvotes) || Number(c.downvote_count) || 0;

        body.innerHTML = `
          <div class="rw-back">
            <button type="button" class="rw-link" data-action="back" style="font-size:12px;padding:6px 10px">← Back</button>
          </div>
          <div class="rw-item" style="cursor:default">
            ${label ? `<span class="${pillClass(label)}" style="margin-bottom:8px;display:inline-flex">${escapeHtml(label)}</span>` : ''}
            <div class="rw-detail-title">${escapeHtml(c.title)}</div>
            <div class="rw-muted" style="margin-top:2px">🕐 ${date}</div>
            <div class="rw-body-html">${bodyHtml}</div>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button type="button" class="rw-vote-btn" data-action="vote" data-id="${escapeHtml(c.id)}" data-type="upvote">👍 <span class="rw-ups">${ups}</span></button>
              <button type="button" class="rw-vote-btn" data-action="vote" data-id="${escapeHtml(c.id)}" data-type="downvote">👎 <span class="rw-downs">${downs}</span></button>
            </div>
            <div class="rw-comments-section">
              <div style="font:700 12px/1 system-ui;color:#374151;margin-bottom:10px;display:flex;align-items:center;gap:6px">
                💬 Comments <span class="rw-muted">(${nested.length})</span>
              </div>
              <div id="rwCommentsList">${comments || `<div class="rw-muted" style="padding:8px 0">No comments yet — be the first!</div>`}</div>
            </div>
          </div>`;

        renderCommentFooter(c.id);
      };

      // ── Data loading ──────────────────────────────────────────────────
      const loadData = async () => {
        renderLoading();
        try {
          try {
            const settings = await fetchJson(`${apiBase}/api/public/settings`);
            if (settings?.config?.company?.name && !opts.title) titleEl.textContent = settings.config.company.name;
          } catch (_) {}

          labelCountsCache = ((await fetchJson(`${apiBase}/api/p/${encodeURIComponent(projectKey)}/changelogs/labels`)).counts || {});
          const listUrl = `${apiBase}/api/p/${encodeURIComponent(projectKey)}/changelogs?page=1&limit=${opts.limit || 10}${(activeLabel || opts.label) ? `&label=${encodeURIComponent(activeLabel || opts.label)}` : ''}${locale ? `&locale=${encodeURIComponent(locale)}` : ''}`;
          const data = await fetchJson(listUrl);
          listCache = data.changelogs || [];
          if (!activeLabel) {
            const available = Object.keys(labelCountsCache || {}).filter(k => (labelCountsCache[k] || 0) > 0);
            activeLabel = '';
          }
          renderList(listCache);
          loadedOnce = true;
        } catch (e) {
          renderError(e?.message || 'Failed to load releases');
        }
      };

      const loadListForLabel = async (label) => {
        renderLoading();
        try {
          activeLabel = label || '';
          const listUrl = `${apiBase}/api/p/${encodeURIComponent(projectKey)}/changelogs?page=1&limit=${opts.limit || 10}${activeLabel ? `&label=${encodeURIComponent(activeLabel)}` : ''}${locale ? `&locale=${encodeURIComponent(locale)}` : ''}`;
          const data = await fetchJson(listUrl);
          listCache = data.changelogs || [];
          selectedId = null;
          renderList(listCache);
        } catch (e) {
          renderError(e?.message || 'Failed to load releases');
        }
      };

      const loadDetail = async (id) => {
        renderLoading();
        try {
          const url = `${apiBase}/api/p/${encodeURIComponent(projectKey)}/changelogs/${encodeURIComponent(String(id))}${locale ? `?locale=${encodeURIComponent(locale)}` : ''}`;
          const d = await fetchJson(url);
          selectedId = id;
          renderDetail(d.changelog);
        } catch (e) {
          renderError(e?.message || 'Failed to load release');
        }
      };

      const sendComment = async (id) => {
        const content = (document.getElementById('rwComment')?.value || '').trim();
        if (!content) return;
        const btn = document.getElementById('rwSend');
        if (btn) btn.disabled = true;
        try {
          const payload = { content, _gotcha: '' };
          if (identity.name) payload.author_name = identity.name;
          if (identity.email) payload.author_email = identity.email;
          if (replyParentId) payload.parent_id = replyParentId;
          const res = await fetch(`${apiBase}/api/p/${encodeURIComponent(projectKey)}/changelogs/${encodeURIComponent(String(id))}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            credentials: 'omit'
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Failed to send comment');
          replyParentId = null;
          await loadDetail(id);
        } catch (e) {
          alert(e?.message || 'Failed to send comment');
          const b = document.getElementById('rwSend');
          if (b) b.disabled = false;
        }
      };

      const sendVote = async (id, type) => {
        try {
          const res = await fetch(`${apiBase}/api/p/${encodeURIComponent(projectKey)}/changelogs/${encodeURIComponent(String(id))}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vote_type: type }),
            credentials: 'omit'
          });
          const data = await res.json().catch(() => ({}));
          const newUps = data.upvotes ?? data.upvote_count;
          const newDowns = data.downvotes ?? data.downvote_count;
          if (newUps != null) {
            const uEl = body.querySelector('.rw-ups');
            const dEl = body.querySelector('.rw-downs');
            if (uEl) uEl.textContent = newUps;
            if (dEl) dEl.textContent = newDowns;
          }
          const upBtn = body.querySelector('[data-action="vote"][data-type="upvote"]');
          const dnBtn = body.querySelector('[data-action="vote"][data-type="downvote"]');
          if (type === 'upvote' && upBtn) upBtn.classList.toggle('rw-voted-up');
          if (type === 'downvote' && dnBtn) dnBtn.classList.toggle('rw-voted-down');
        } catch (_) {}
      };

      // ── Event delegation ──────────────────────────────────────────────
      function handleClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === 'reply-comment') {
          replyParentId = parseInt(btn.dataset.parent, 10);
          const hint = document.getElementById('rwReplyHint');
          const hintText = document.getElementById('rwReplyHintText');
          if (hint) { hint.style.display = 'flex'; }
          if (hintText) hintText.textContent = `Replying to ${btn.dataset.name || 'comment'}`;
          document.getElementById('rwComment')?.focus();
          return;
        }
        if (action === 'cancel-reply') {
          replyParentId = null;
          const hint = document.getElementById('rwReplyHint');
          if (hint) hint.style.display = 'none';
          return;
        }
        if (action === 'set-name') {
          const nf = document.getElementById('rwNameForm');
          if (nf) nf.style.display = nf.style.display === 'none' ? 'flex' : 'none';
          return;
        }
        if (action === 'save-name') {
          const name = (document.getElementById('rwName')?.value || '').trim();
          const email = (document.getElementById('rwEmail')?.value || '').trim();
          identity = { name, email };
          saveIdentity(name, email);
          const dn = document.getElementById('rwDisplayName');
          if (dn) dn.textContent = name || 'Anonymous';
          const sl = footer.querySelector('[data-action="set-name"]');
          if (sl) sl.textContent = name ? '✎ edit' : 'Set your name';
          const nf = document.getElementById('rwNameForm');
          if (nf) nf.style.display = 'none';
          return;
        }
        if (action === 'tab') {
          loadListForLabel(btn.dataset.label || '');
          return;
        }
        if (action === 'open') {
          loadDetail(btn.dataset.id);
          return;
        }
        if (action === 'back') {
          renderList(listCache);
          return;
        }
        if (action === 'send') {
          sendComment(btn.dataset.id);
          return;
        }
        if (action === 'vote') {
          sendVote(btn.dataset.id, btn.dataset.type);
          return;
        }
      }

      body.addEventListener('click', handleClick);
      footer.addEventListener('click', handleClick);

      const open = () => { overlay.classList.add('rw-open'); drawer.classList.add('rw-open'); isOpen = true; if (!loadedOnce) loadData(); };
      const close = () => { overlay.classList.remove('rw-open'); drawer.classList.remove('rw-open'); isOpen = false; };
      const toggle = () => isOpen ? close() : open();

      overlay.addEventListener('click', close);
      closeBtn.addEventListener('click', close);
      document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

      if (opts.triggerId) {
        const el = document.getElementById(opts.triggerId);
        if (!el) { console.warn(`ReleaseWidget.init: triggerId "${opts.triggerId}" not found`); return; }
        el.addEventListener('click', e => { e.preventDefault(); toggle(); });
        return;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opts.label || 'Changelog';
      btn.setAttribute('aria-label', btn.textContent);
      btn.style.cssText =
        'position:fixed;z-index:2147483000;padding:10px 16px;border-radius:9999px;border:none;' +
        'background:#111827;color:#fff;font:600 13px/1 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;' +
        'box-shadow:0 4px 20px rgba(0,0,0,.22);cursor:pointer;transition:transform 120ms,box-shadow 120ms';
      btn.onmouseenter = () => { btn.style.transform = 'scale(1.04)'; btn.style.boxShadow = '0 8px 28px rgba(0,0,0,.28)'; };
      btn.onmouseleave = () => { btn.style.transform = ''; btn.style.boxShadow = '0 4px 20px rgba(0,0,0,.22)'; };
      if (position === 'left') btn.style.left = '16px'; else btn.style.right = '16px';
      btn.style.bottom = '16px';
      btn.addEventListener('click', e => { e.preventDefault(); toggle(); });
      document.body.appendChild(btn);
    }
  };
  global.ReleaseWidget = ReleaseWidget;
})(typeof window !== 'undefined' ? window : globalThis);
