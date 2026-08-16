/**
 * Self-contained settings page (HTML/CSS/JS inline, no external resources).
 *
 * Served at `/` by `./server.ts`; talks only to the same-origin JSON API
 * (`GET/PUT /api/settings`, `POST /api/preview`).
 *
 * Constraint: the whole document lives inside a single backtick template
 * literal, so the embedded JS must never use backticks or `${...}` — only
 * single-quoted strings and `+` concatenation.
 */

export const WEB_PAGE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>opencode-archivist 设置</title>
<style>
  :root {
    --glow: rgba(76, 95, 213, 0.09);
    --bg: #f4f5f7;
    --surface: #ffffff;
    --surface-2: #f8f9fb;
    --surface-3: #eceef3;
    --border: #e4e7ec;
    --border-strong: #d3d8e0;
    --text: #1c2027;
    --text-secondary: #5a6371;
    --text-faint: #8b93a1;
    --accent: #4c5fd5;
    --accent-soft: rgba(76, 95, 213, 0.09);
    --chip-hover: rgba(76, 95, 213, 0.17);
    --focus-ring: rgba(76, 95, 213, 0.22);
    --btn-bg: #4c5fd5;
    --btn-bg-hover: #3d4fbd;
    --danger: #c93a3a;
    --danger-soft: rgba(201, 58, 58, 0.4);
    --success: #177a4a;
    --success-soft: rgba(23, 122, 74, 0.35);
    --preview-bg: #f6f7f9;
    --badge-override-bg: #fdf0d1;
    --badge-override-text: #8a5c06;
    --badge-default-bg: #eef0f3;
    --badge-default-text: #5a6371;
    --shadow-card: 0 1px 2px rgba(15, 23, 42, 0.05), 0 12px 32px -16px rgba(15, 23, 42, 0.14);
    --shadow-pop: 0 8px 24px -8px rgba(15, 23, 42, 0.2);
    --radius-lg: 14px;
    --radius-md: 10px;
    --radius-sm: 7px;
    --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
    --font-mono: ui-monospace, 'SF Mono', 'Cascadia Code', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, monospace, 'PingFang SC', 'Microsoft YaHei';
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --glow: rgba(127, 144, 255, 0.11);
      --bg: #0d0f13;
      --surface: #161922;
      --surface-2: #1a1e28;
      --surface-3: #232836;
      --border: #262c3a;
      --border-strong: #363d4f;
      --text: #e7eaf0;
      --text-secondary: #a0a8b6;
      --text-faint: #6f7786;
      --accent: #8493ff;
      --accent-soft: rgba(127, 144, 255, 0.13);
      --chip-hover: rgba(127, 144, 255, 0.24);
      --focus-ring: rgba(127, 144, 255, 0.3);
      --btn-bg: #5a6ae0;
      --btn-bg-hover: #6b7af2;
      --danger: #ef6d6d;
      --danger-soft: rgba(239, 109, 109, 0.42);
      --success: #4cc38a;
      --success-soft: rgba(76, 195, 138, 0.42);
      --preview-bg: #10131a;
      --badge-override-bg: rgba(240, 180, 41, 0.15);
      --badge-override-text: #f0c04e;
      --badge-default-bg: rgba(255, 255, 255, 0.07);
      --badge-default-text: #a0a8b6;
      --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.5), 0 16px 40px -20px rgba(0, 0, 0, 0.6);
      --shadow-pop: 0 8px 24px -6px rgba(0, 0, 0, 0.55);
    }
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    min-height: 100vh;
    font-family: var(--font-ui);
    font-size: 14px;
    line-height: 1.5;
    color: var(--text);
    background:
      radial-gradient(900px 420px at 50% -8%, var(--glow), transparent 65%),
      var(--bg);
  }

  .page {
    max-width: 660px;
    margin: 0 auto;
    padding: 48px 20px 64px;
  }

  @media (max-width: 560px) {
    .page { padding: 28px 14px 48px; }
  }

  /* ---------- header ---------- */

  .page-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 22px;
  }

  .logo {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    color: var(--accent);
    background: var(--accent-soft);
    border: 1px solid var(--border);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 650;
    letter-spacing: -0.01em;
    color: var(--text);
  }

  .subtitle {
    margin: 3px 0 0;
    font-size: 13px;
    color: var(--text-secondary);
  }

  /* ---------- card ---------- */

  .card {
    display: flex;
    flex-direction: column;
    gap: 22px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    padding: 26px 26px 22px;
  }

  @media (max-width: 560px) {
    .card { padding: 20px 16px 18px; }
  }

  /* ---------- fields ---------- */

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .field-head label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .badge {
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.02em;
    padding: 5px 9px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .badge.override {
    background: var(--badge-override-bg);
    color: var(--badge-override-text);
  }

  .badge.default {
    background: var(--badge-default-bg);
    color: var(--badge-default-text);
  }

  input[type="text"] {
    width: 100%;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    padding: 9px 12px;
    transition: border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease;
  }

  input[type="text"]::placeholder { color: var(--text-faint); }

  input[type="text"]:hover { background: var(--surface); }

  input[type="text"]:focus {
    outline: none;
    background: var(--surface);
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-faint);
  }

  /* ---------- toggle switch ---------- */

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .switch {
    position: relative;
    display: inline-block;
    flex-shrink: 0;
    cursor: pointer;
    touch-action: manipulation;
  }

  .switch input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    border: 0;
    white-space: nowrap;
  }

  .switch .track {
    position: relative;
    display: block;
    width: 40px;
    height: 24px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border-strong);
    transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }

  .switch .track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.22);
    transition: transform 160ms ease;
  }

  .switch input:checked + .track {
    background: var(--btn-bg);
    border-color: var(--btn-bg);
  }

  .switch input:checked + .track::after {
    transform: translateX(19px);
    border-color: transparent;
  }

  .switch input:focus-visible + .track {
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .switch:hover .track { border-color: var(--accent); }

  /* ---------- placeholder chips + legend ---------- */

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1;
    color: var(--accent);
    background: var(--accent-soft);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    padding: 7px 10px;
    cursor: pointer;
    transition: background-color 140ms ease, border-color 140ms ease, transform 140ms ease;
  }

  .chip:hover {
    background: var(--chip-hover);
    border-color: var(--focus-ring);
  }

  .chip:active { transform: translateY(1px); }

  .chip:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 6px 14px;
  }

  .legend li {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .legend code {
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text);
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 2px 6px;
    white-space: nowrap;
  }

  /* ---------- live preview ---------- */

  .preview {
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--preview-bg);
    padding: 12px 14px;
  }

  .preview-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .preview-title {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 0 3px var(--success-soft);
  }

  .preview-sample {
    font-size: 11px;
    color: var(--text-faint);
    text-align: right;
  }

  @media (max-width: 560px) {
    .preview-sample { display: none; }
  }

  .preview-box {
    min-height: 42px;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    word-break: break-all;
    cursor: text;
    user-select: all;
    transition: border-color 140ms ease, opacity 140ms ease;
  }

  .preview-box::selection { background: var(--focus-ring); }

  .preview-box.empty {
    font-family: var(--font-ui);
    font-size: 12.5px;
    color: var(--text-faint);
  }

  .preview-box.empty::before { content: '输入模板后，此处将实时显示示例文件名'; }

  .preview-box.updating { opacity: 0.55; }

  .preview-box.error {
    color: var(--danger);
    border-color: var(--danger);
  }

  /* ---------- actions ---------- */

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 18px;
    border-top: 1px solid var(--border);
  }

  @media (max-width: 560px) {
    .actions { flex-direction: column; }
    .actions .btn { width: 100%; }
  }

  .btn {
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 600;
    padding: 9px 18px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
  }

  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .btn:active:not(:disabled) { transform: translateY(1px); }

  .btn:disabled { opacity: 0.55; cursor: default; }

  .btn.primary {
    background: var(--btn-bg);
    color: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  .btn.primary:hover:not(:disabled) { background: var(--btn-bg-hover); }

  .btn.ghost {
    background: transparent;
    color: var(--text-secondary);
    border-color: var(--border-strong);
  }

  .btn.ghost:hover:not(:disabled) {
    color: var(--danger);
    border-color: var(--danger-soft);
    background: var(--danger-soft);
  }

  /* ---------- toast ---------- */

  .toast {
    position: fixed;
    left: 50%;
    bottom: 28px;
    transform: translate(-50%, 12px);
    max-width: min(440px, calc(100vw - 32px));
    padding: 10px 16px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
    text-align: center;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-pop);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 160ms ease, transform 160ms ease, visibility 0s linear 160ms;
  }

  .toast.show {
    opacity: 1;
    visibility: visible;
    transform: translate(-50%, 0);
    transition-delay: 0s;
  }

  .toast.success { border-color: var(--success-soft); }
  .toast.error { border-color: var(--danger-soft); color: var(--danger); }

  /* ---------- footer ---------- */

  .page-footer {
    margin-top: 20px;
    text-align: center;
  }

  .page-footer p {
    margin: 0;
    font-size: 12px;
    color: var(--text-faint);
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
</head>
<body>
  <div class="page">
    <header class="page-header">
      <span class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="15" rx="2.5"></rect>
          <path d="M3 9.5h18"></path>
          <path d="M9 13.5h6"></path>
        </svg>
      </span>
      <div>
        <h1>opencode-archivist 设置</h1>
        <p class="subtitle">配置会话归档的保存位置与文件名规则</p>
      </div>
    </header>

    <main>
      <form id="settingsForm" class="card" novalidate>
        <section class="field">
          <div class="field-head">
            <label for="enabled">保存对话</label>
            <span id="enabledBadge" class="badge default">配置</span>
          </div>
          <div class="toggle-row">
            <p class="hint">关闭后不再归档会话（下次会话生效）</p>
            <label class="switch">
              <input id="enabled" type="checkbox" role="switch">
              <span class="track" aria-hidden="true"></span>
            </label>
          </div>
        </section>

        <section class="field">
          <div class="field-head">
            <label for="archiveDir">归档目录</label>
            <span id="archiveDirBadge" class="badge default">配置</span>
          </div>
          <input id="archiveDir" type="text" spellcheck="false" autocomplete="off" placeholder="例如：~/archives/opencode">
          <p class="hint">留空则使用配置文件中的默认值；支持 ~ 展开用户主目录。</p>
        </section>

        <section class="field">
          <div class="field-head">
            <label for="filenameTemplate">文件名模板</label>
            <span id="filenameTemplateBadge" class="badge default">配置</span>
          </div>
          <input id="filenameTemplate" type="text" spellcheck="false" autocomplete="off" placeholder="例如：{date}_{title}.md">
          <div class="chips" role="group" aria-label="插入占位符">
            <button type="button" class="chip" data-ph="{title}" title="插入 {title}">{title}</button>
            <button type="button" class="chip" data-ph="{id}" title="插入 {id}">{id}</button>
            <button type="button" class="chip" data-ph="{date}" title="插入 {date}">{date}</button>
            <button type="button" class="chip" data-ph="{project}" title="插入 {project}">{project}</button>
          </div>
          <ul class="legend">
            <li><code>{title}</code><span>会话标题</span></li>
            <li><code>{id}</code><span>会话 ID</span></li>
            <li><code>{date}</code><span>会话日期</span></li>
            <li><code>{project}</code><span>项目名</span></li>
          </ul>
          <p class="hint">点击占位符插入到光标处；留空则使用配置文件中的默认模板。</p>
        </section>

        <section class="preview">
          <div class="preview-head">
            <span class="preview-title"><span class="dot" aria-hidden="true"></span>实时预览</span>
            <span class="preview-sample">示例：标题「示例会话标题」· 日期 2026-01-15 · 项目 sample-project</span>
          </div>
          <div id="filenamePreview" class="preview-box empty"></div>
        </section>

        <div class="actions">
          <button type="submit" id="saveBtn" class="btn primary">保存</button>
          <button type="button" id="resetBtn" class="btn ghost">重置</button>
        </div>
      </form>
    </main>

    <footer class="page-footer">
      <p>opencode-archivist · 本地设置页面，仅修改当前机器的配置</p>
    </footer>
  </div>

  <div id="toast" class="toast" role="status" aria-live="polite"></div>

  <script>
  'use strict';
  (function () {
    function el(id) { return document.getElementById(id); }

    var form = el('settingsForm');
    var archiveDirInput = el('archiveDir');
    var templateInput = el('filenameTemplate');
    var enabledInput = el('enabled');
    var previewBox = el('filenamePreview');
    var saveBtn = el('saveBtn');
    var resetBtn = el('resetBtn');
    var toast = el('toast');

    var toastTimer = null;
    var debounceTimer = null;
    var previewSeq = 0;

    function showToast(message, kind) {
      toast.textContent = message;
      toast.className = 'toast show ' + (kind === 'error' ? 'error' : 'success');
      if (toastTimer !== null) { clearTimeout(toastTimer); }
      toastTimer = setTimeout(function () { toast.className = 'toast'; }, 3200);
    }

    function renderBadge(id, source) {
      var badge = el(id);
      var isOverride = source === 'settings';
      badge.textContent = isOverride ? '设置' : '配置';
      badge.className = 'badge ' + (isOverride ? 'override' : 'default');
      badge.title = isOverride ? '当前值来自本地设置' : '当前值来自配置文件默认';
    }

    function renderSources(sources) {
      renderBadge('archiveDirBadge', sources.archiveDir);
      renderBadge('filenameTemplateBadge', sources.filenameTemplate);
      renderBadge('enabledBadge', sources.enabled);
    }

    function applyResponse(data) {
      if (!data || !data.effective || !data.sources) { return; }
      archiveDirInput.value = data.effective.archiveDir || '';
      templateInput.value = data.effective.filenameTemplate || '';
      enabledInput.checked = data.effective.enabled === true;
      renderSources(data.sources);
      schedulePreview();
    }

    function schedulePreview() {
      if (debounceTimer !== null) { clearTimeout(debounceTimer); }
      debounceTimer = setTimeout(refreshPreview, 250);
    }

    function refreshPreview() {
      var seq = ++previewSeq;
      var template = templateInput.value;
      if (template.trim() === '') {
        previewBox.className = 'preview-box empty';
        previewBox.textContent = '';
        return;
      }
      previewBox.className = 'preview-box updating';
      fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: template })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, data: data };
        });
      }).then(function (result) {
        if (seq !== previewSeq) { return; }
        if (result.ok && typeof result.data.filename === 'string') {
          previewBox.className = 'preview-box';
          previewBox.textContent = result.data.filename;
        } else {
          var msg = (result.data && typeof result.data.error === 'string') ? result.data.error : '预览失败';
          previewBox.className = 'preview-box error';
          previewBox.textContent = msg;
        }
      }).catch(function () {
        if (seq !== previewSeq) { return; }
        previewBox.className = 'preview-box error';
        previewBox.textContent = '预览失败：无法连接本地服务';
      });
    }

    function insertPlaceholder(chip) {
      var ph = chip.getAttribute('data-ph');
      var value = templateInput.value;
      var start = templateInput.selectionStart === null ? value.length : templateInput.selectionStart;
      var end = templateInput.selectionEnd === null ? value.length : templateInput.selectionEnd;
      templateInput.value = value.substring(0, start) + ph + value.substring(end);
      var pos = start + ph.length;
      templateInput.focus();
      templateInput.setSelectionRange(pos, pos);
      schedulePreview();
    }

    function setBusy(busy) {
      saveBtn.disabled = busy;
      resetBtn.disabled = busy;
    }

    function handleSave(event) {
      event.preventDefault();
      if (saveBtn.disabled) { return; }
      var archiveDir = archiveDirInput.value.trim();
      var template = templateInput.value.trim();
      var payload = {
        archiveDir: archiveDir === '' ? null : archiveDir,
        filenameTemplate: template === '' ? null : template,
        enabled: enabledInput.checked
      };
      setBusy(true);
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      }).then(function (result) {
        if (result.ok) {
          applyResponse(result.data);
          showToast('设置已保存', 'success');
        } else {
          var msg = (result.data && typeof result.data.error === 'string') ? result.data.error : '保存失败（HTTP ' + result.status + '）';
          showToast(msg, 'error');
        }
      }).catch(function () {
        showToast('保存失败：无法连接本地服务', 'error');
      }).then(function () {
        setBusy(false);
      });
    }

    function handleReset() {
      if (resetBtn.disabled) { return; }
      if (!window.confirm('确定清除自定义设置，回退到配置文件中的默认值吗？')) { return; }
      setBusy(true);
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archiveDir: null, filenameTemplate: null, enabled: null })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, data: data };
        });
      }).then(function (result) {
        if (result.ok) {
          applyResponse(result.data);
          showToast('已恢复默认配置', 'success');
        } else {
          var msg = (result.data && typeof result.data.error === 'string') ? result.data.error : '重置失败';
          showToast(msg, 'error');
        }
      }).catch(function () {
        showToast('重置失败：无法连接本地服务', 'error');
      }).then(function () {
        setBusy(false);
      });
    }

    form.addEventListener('submit', handleSave);
    resetBtn.addEventListener('click', handleReset);

    var chips = document.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function () { insertPlaceholder(this); });
    }

    loadSettings();

    function loadSettings() {
      fetch('/api/settings').then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      }).then(applyResponse).catch(function () {
        showToast('加载设置失败：无法连接本地服务', 'error');
      });
    }
  })();
  </script>
</body>
</html>
`;
