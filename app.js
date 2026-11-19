(function () {
  'use strict';

  const CATS = {
    movie: { label: '映画',   titlePh: '映画のタイトル',       subEn: 'Director', subJa: '監督',         subPh: '監督名',               memoPh: 'ひとこと感想' },
    book:  { label: '本',     titlePh: '本のタイトル',         subEn: 'Author',   subJa: '著者',         subPh: '著者名',               memoPh: 'ひとこと感想' },
    art:   { label: '美術',   titlePh: '展覧会・作品名',       subEn: 'Artist',   subJa: 'アーティスト', subPh: 'アーティスト名・会場', memoPh: 'ひとこと感想' },
    cafe:  { label: '喫茶店', titlePh: '店名',                 subEn: 'Area',     subJa: 'エリア',       subPh: 'エリア・最寄り駅など', memoPh: '頼んだメニュー・雰囲気など' },
    live:  { label: 'ライブ', titlePh: '公演・アーティスト名', subEn: 'Venue',    subJa: '会場',         subPh: '会場・ステージ名',     memoPh: 'セットリスト・感想など' }
  };
  const ORDER = ['movie', 'book', 'art', 'cafe', 'live'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const LOG_KEY = 'cultlog-logs';
  const META_KEY = 'cultlog-meta';
  const STALE_DAYS = 30;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  // ---------- storage ----------
  function readLogsRaw() {
    let raw = null;
    try { raw = localStorage.getItem(LOG_KEY); } catch (e) { return []; }
    if (!raw) return [];
    try {
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      // 壊れたデータは上書きせず退避する
      try { localStorage.setItem(LOG_KEY + '-corrupt-' + Date.now(), raw); } catch (e2) { /* ignore */ }
      return [];
    }
  }

  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; }
  }

  function writeMeta(patch) {
    const next = Object.assign(readMeta(), patch);
    try { localStorage.setItem(META_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
    return next;
  }

  function saveLogs() {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(logs));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- model ----------
  const pad = (n) => String(n).padStart(2, '0');
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function isoFromTs(ts) {
    const d = new Date(ts);
    return isNaN(d) ? todayISO() : d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function normDate(v) {
    const m = String(v || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return m ? m[1] + '-' + pad(m[2]) + '-' + pad(m[3]) : '';
  }

  // 旧バージョン(creator / スラッシュ区切りの日付 / 数値ID)も受け付ける
  function normLog(r) {
    if (!r || typeof r !== 'object') return null;
    const title = String(r.title == null ? '' : r.title).trim();
    if (!title || !CATS[r.category]) return null;
    const createdAt = Number(r.createdAt) || Number(r.id) || Date.now();
    return {
      id: String(r.id == null || r.id === '' ? newId() : r.id),
      category: r.category,
      date: normDate(r.date) || isoFromTs(createdAt),
      title: title,
      subtitle: String(r.subtitle != null ? r.subtitle : (r.creator != null ? r.creator : '')).trim(),
      memo: String(r.memo == null ? '' : r.memo).trim(),
      createdAt: createdAt
    };
  }

  function sortLogs() {
    logs.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.createdAt - a.createdAt));
  }

  let logs = readLogsRaw().map(normLog).filter(Boolean);
  sortLogs();
  let activeFilter = 'all';
  let statusTimer = null;

  // ---------- sync (Firebase) ----------
  let sync = null;        // 同期の操作一式(設定がない・読み込み前は null)
  let syncUser = null;    // ログイン中のユーザー
  let syncInfo = { fromCache: true, pending: false };

  const persistAdd = (entry) => { if (sync && syncUser) sync.upsert(entry); };
  const persistRemove = (id) => { if (sync && syncUser) sync.remove(id); };

  function syncStateKey() {
    if (!syncUser) return '';
    if (syncInfo.pending || syncInfo.fromCache) return navigator.onLine ? 'syncing' : 'offline';
    return 'synced';
  }

  const SYNC_LABEL = {
    synced: ['synced', '同期済みです。'],
    syncing: ['syncing', '同期しています…'],
    offline: ['offline', 'オフラインです。つながったら自動で同期します。']
  };

  function authMessage(err) {
    const code = err && err.code ? err.code : '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found': return 'メールアドレスかパスワードが違います。はじめての場合は「新規登録」を押してください。';
      case 'auth/email-already-in-use': return 'このメールアドレスは登録済みです。「ログイン」を押してください。';
      case 'auth/weak-password': return 'パスワードは6文字以上にしてください。';
      case 'auth/invalid-email': return 'メールアドレスの形式を確認してください。';
      case 'auth/missing-password': return 'パスワードを入力してください。';
      case 'auth/too-many-requests': return '試行回数が多すぎます。しばらく待ってからやり直してください。';
      case 'auth/network-request-failed': return '通信できませんでした。接続を確認してください。';
      case 'auth/operation-not-allowed': return 'Firebase 側でメール/パスワードのログインが有効になっていません。';
      case 'permission-denied': return '保存先への書き込みが許可されていません。Firebase のルール設定を確認してください。';
      default: return '同期でエラーが起きました(' + (code || '不明') + ')。';
    }
  }

  // ---------- helpers ----------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function glyph(cat) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'glyph');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#g-' + cat);
    svg.appendChild(use);
    return svg;
  }

  function fmtJa(d) {
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function setStatus(node, msg, opts) {
    opts = opts || {};
    clearTimeout(statusTimer);
    node.textContent = msg;
    node.classList.toggle('is-error', !!opts.error);
    if (opts.link) {
      const a = el('a', null, opts.link.text);
      a.href = opts.link.href;
      node.appendChild(a);
    }
    if (!opts.keep) statusTimer = setTimeout(() => { node.textContent = ''; node.classList.remove('is-error'); }, 6000);
  }

  // ---------- form ----------
  const form = $('entry-form');
  const fDate = $('f-date');
  const fTitle = $('f-title');
  const fSub = $('f-sub');
  const fSubLabel = $('f-sub-label');
  const fMemo = $('f-memo');
  const statusEl = $('status');
  const chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));

  fDate.value = todayISO();

  function selectedCat() {
    const c = form.querySelector('input[name="cat"]:checked');
    return c ? c.value : 'movie';
  }

  function syncChips() {
    chips.forEach((chip) => chip.classList.toggle('is-on', chip.querySelector('input').checked));
    const meta = CATS[selectedCat()];
    fTitle.placeholder = meta.titlePh;
    fSub.placeholder = meta.subPh;
    fMemo.placeholder = meta.memoPh;
    fSubLabel.textContent = meta.subEn;
    const span = el('span', null, meta.subJa);
    fSubLabel.appendChild(span);
  }

  form.addEventListener('change', (e) => { if (e.target.name === 'cat') syncChips(); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = fTitle.value.trim();
    if (!title) {
      setStatus(statusEl, 'タイトルを入力してください。', { error: true });
      fTitle.focus();
      return;
    }
    const entry = normLog({
      id: newId(),
      category: selectedCat(),
      date: fDate.value || todayISO(),
      title: title,
      subtitle: fSub.value,
      memo: fMemo.value,
      createdAt: Date.now()
    });
    logs.push(entry);
    sortLogs();
    if (!saveLogs()) {
      logs = logs.filter((l) => l !== entry);
      setStatus(statusEl, '保存できませんでした。ブラウザの設定(プライベートモードなど)を確認してください。', { error: true });
      return;
    }
    persistAdd(entry);
    fTitle.value = '';
    fSub.value = '';
    fMemo.value = '';
    activeFilter = 'all';
    render();
    setStatus(statusEl, '記録しました。', { link: { text: '一覧で見る', href: '#archive' } });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  });

  // ---------- archive ----------
  function renderFilters() {
    const box = $('filters');
    box.textContent = '';
    const counts = { all: logs.length };
    ORDER.forEach((c) => { counts[c] = 0; });
    logs.forEach((l) => { counts[l.category]++; });

    [{ id: 'all', label: 'すべて' }].concat(ORDER.map((c) => ({ id: c, label: CATS[c].label }))).forEach((f) => {
      const b = el('button', 'flt');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(f.id === activeFilter));
      if (f.id !== 'all') b.appendChild(glyph(f.id));
      b.appendChild(el('span', null, f.label));
      b.appendChild(el('sup', null, String(counts[f.id])));
      b.addEventListener('click', () => { activeFilter = f.id; renderFilters(); renderList(); });
      box.appendChild(b);
    });
  }

  function buildEntry(log) {
    const [y, m, d] = log.date.split('-').map(Number);
    const art = el('article', 'entry');
    art.dataset.id = log.id;

    const date = el('div', 'e-date');
    date.appendChild(el('span', 'e-day', pad(d)));
    date.appendChild(el('span', 'e-dow', DOW[new Date(y, m - 1, d).getDay()]));
    art.appendChild(date);

    const body = el('div', 'e-body');
    const cat = el('div', 'e-cat');
    cat.appendChild(glyph(log.category));
    cat.appendChild(el('span', null, CATS[log.category].label));
    body.appendChild(cat);
    body.appendChild(el('h3', 'e-title', log.title));
    if (log.subtitle) body.appendChild(el('div', 'e-sub', log.subtitle));
    if (log.memo) body.appendChild(el('p', 'e-memo', log.memo));

    const actions = el('div', 'e-actions');
    showDeleteButton(actions, log);
    body.appendChild(actions);
    art.appendChild(body);
    return art;
  }

  function showDeleteButton(actions, log) {
    actions.textContent = '';
    const del = el('button', 'link-btn', '削除');
    del.type = 'button';
    del.addEventListener('click', () => {
      actions.textContent = '';
      actions.appendChild(el('span', 'confirm-text', 'この記録を削除しますか?'));
      const yes = el('button', 'link-btn danger', '削除する');
      yes.type = 'button';
      yes.addEventListener('click', () => {
        const before = logs.slice();
        logs = logs.filter((l) => l.id !== log.id);
        if (!saveLogs()) { logs = before; return; }
        persistRemove(log.id);
        render();
      });
      const no = el('button', 'link-btn', 'やめる');
      no.type = 'button';
      no.addEventListener('click', () => showDeleteButton(actions, log));
      actions.appendChild(yes);
      actions.appendChild(no);
      yes.focus();
    });
    actions.appendChild(del);
  }

  function renderList() {
    const box = $('log-list');
    box.textContent = '';
    const visible = activeFilter === 'all' ? logs : logs.filter((l) => l.category === activeFilter);

    if (!visible.length) {
      const empty = el('div', 'empty');
      if (!logs.length) {
        empty.appendChild(el('p', 'big', 'Nothing here yet.'));
        empty.appendChild(el('p', 'small', '最初の一件を記録しましょう。以前の記録がある場合は、下の「保存」から読み込めます。'));
      } else {
        empty.appendChild(el('p', 'big', 'No entries in this category.'));
        empty.appendChild(el('p', 'small', 'このジャンルの記録はまだありません。'));
      }
      box.appendChild(empty);
      return;
    }

    const groups = [];
    visible.forEach((l) => {
      const ym = l.date.slice(0, 7);
      let g = groups[groups.length - 1];
      if (!g || g.ym !== ym) { g = { ym: ym, items: [] }; groups.push(g); }
      g.items.push(l);
    });

    groups.forEach((g) => {
      const h = el('h3', 'month', g.ym.replace('-', '.'));
      h.appendChild(el('b', null, g.items.length + (g.items.length === 1 ? ' entry' : ' entries')));
      box.appendChild(h);
      g.items.forEach((l) => box.appendChild(buildEntry(l)));
    });
  }

  function renderHero() {
    const n = logs.length;
    const key = syncStateKey();
    const tag = key ? ' · ' + SYNC_LABEL[key][0] : '';
    if (!n) { $('hero-meta').textContent = 'Your log begins here.' + tag; return; }
    const oldest = logs.reduce((a, l) => (l.date < a ? l.date : a), logs[0].date);
    $('hero-meta').textContent = n + (n === 1 ? ' entry' : ' entries') + ' · since ' + oldest.slice(0, 7).replace('-', '.') + tag;
  }

  // ---------- backup ----------
  const backupState = $('backup-state');
  const backupStatus = $('backup-status');
  const backupDot = $('backup-dot');

  function daysSince(iso) {
    return (Date.now() - new Date(iso).getTime()) / 86400000;
  }

  function renderBackup() {
    const last = readMeta().lastExport;
    let stale = false;
    if (last) {
      backupState.textContent = '最後の書き出し — ' + fmtJa(new Date(last));
      stale = logs.length > 0 && daysSince(last) > STALE_DAYS;
    } else {
      backupState.textContent = 'まだ書き出していません';
      stale = logs.length > 0;
    }
    backupDot.hidden = !stale || !!syncUser;
  }

  $('export-btn').addEventListener('click', () => {
    const payload = { app: 'cultlog', version: 1, exportedAt: new Date().toISOString(), logs: logs };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cultlog-backup-' + todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    writeMeta({ lastExport: new Date().toISOString() });
    renderBackup();
    setStatus(backupStatus, logs.length + '件の記録をファイルに書き出しました。');
  });

  const importInput = $('import-input');
  $('import-btn').addEventListener('click', () => importInput.click());

  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const arr = Array.isArray(data) ? data : (data && Array.isArray(data.logs) ? data.logs : null);
      if (!arr) throw new Error('format');
      const ids = new Set(logs.map((l) => l.id));
      let added = 0, skipped = 0, invalid = 0;
      const before = logs.slice();
      const addedEntries = [];
      arr.forEach((r) => {
        const n = normLog(r);
        if (!n) { invalid++; return; }
        if (ids.has(n.id)) { skipped++; return; }
        ids.add(n.id);
        logs.push(n);
        addedEntries.push(n);
        added++;
      });
      sortLogs();
      if (added && !saveLogs()) {
        logs = before;
        setStatus(backupStatus, '保存できませんでした。ブラウザの設定を確認してください。', { error: true });
      } else {
        addedEntries.forEach(persistAdd);
        render();
        let msg = added ? added + '件を読み込みました。' : '新しく追加する記録はありませんでした。';
        if (skipped) msg += '(登録済みの' + skipped + '件はスキップ)';
        if (invalid) msg += '(読み取れなかった' + invalid + '件)';
        setStatus(backupStatus, msg, { keep: true });
      }
    } catch (e) {
      setStatus(backupStatus, '読み込めませんでした。cultlog で書き出した .json ファイルを選んでください。', { error: true });
    }
    importInput.value = '';
  });

  // ---------- theme ----------
  const saved = readMeta().theme;
  if (saved) root.setAttribute('data-theme', saved);

  $('theme-btn').addEventListener('click', () => {
    const eff = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = eff === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    writeMeta({ theme: next });
    const color = next === 'dark' ? '#12221a' : '#ebe6d8';
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
  });

  // ---------- sync UI ----------
  const syncBox = $('sync');
  const syncForm = $('sync-form');
  const syncOn = $('sync-on');
  const syncStatus = $('sync-status');
  const sEmail = $('s-email');
  const sPass = $('s-pass');
  const syncButtons = [$('sync-signin'), $('sync-signup'), $('sync-reset')];

  function renderSync() {
    if (syncBox.hidden) return;
    const signedIn = !!syncUser;
    syncForm.hidden = signedIn;
    syncOn.hidden = !signedIn;
    if (signedIn) {
      $('sync-account').textContent = syncUser.email;
      const key = syncStateKey();
      $('sync-state').textContent = SYNC_LABEL[key][1];
    }
  }

  function busy(on) { syncButtons.forEach((b) => { b.disabled = on; }); }

  async function runAuth(action) {
    const email = sEmail.value.trim();
    if (!email || (action !== 'reset' && !sPass.value)) {
      setStatus(syncStatus, action === 'reset' ? 'メールアドレスを入力してください。' : 'メールアドレスとパスワードを入力してください。', { error: true });
      return;
    }
    busy(true);
    try {
      if (action === 'signin') await sync.signIn(email, sPass.value);
      if (action === 'signup') await sync.signUp(email, sPass.value);
      if (action === 'reset') {
        await sync.resetPassword(email);
        setStatus(syncStatus, 'パスワード再設定のメールを送りました。届いたメールのリンクから設定してください。', { keep: true });
      } else {
        sPass.value = '';
        setStatus(syncStatus, 'ログインしました。');
      }
    } catch (e) {
      setStatus(syncStatus, authMessage(e), { error: true, keep: true });
    }
    busy(false);
  }

  syncForm.addEventListener('submit', (e) => { e.preventDefault(); if (sync) runAuth('signin'); });
  $('sync-signup').addEventListener('click', () => { if (sync) runAuth('signup'); });
  $('sync-reset').addEventListener('click', () => { if (sync) runAuth('reset'); });
  $('sync-signout').addEventListener('click', async () => {
    if (!sync) return;
    writeMeta({ migratedUid: null });
    try { await sync.signOut(); setStatus(syncStatus, 'ログアウトしました。この端末の記録はそのまま残っています。'); } catch (e) { setStatus(syncStatus, authMessage(e), { error: true }); }
  });

  const syncHandlers = {
    onAuth(user) {
      syncUser = user;
      syncInfo = { fromCache: true, pending: false };
      render();
    },
    // この端末の記録を、はじめてアカウントに上げるとき(ログインのたびに1度だけ)
    takeMigration(uid) {
      return readMeta().migratedUid === uid ? null : logs.slice();
    },
    onRemote(docs, info) {
      syncInfo = info;
      const remote = docs.map(normLog).filter(Boolean);
      // キャッシュが空のまま届いた通知で、端末内の記録を消さない
      if (info.fromCache && !remote.length && logs.length) { render(); return; }
      if (!syncUser) return;
      if (readMeta().migratedUid !== syncUser.uid) {
        const byId = new Map(logs.map((l) => [l.id, l]));
        remote.forEach((l) => byId.set(l.id, l));
        logs = Array.from(byId.values());
        if (!info.fromCache && !info.pending) writeMeta({ migratedUid: syncUser.uid });
      } else {
        logs = remote;
      }
      sortLogs();
      saveLogs();
      render();
    },
    onError(err) {
      setStatus(syncStatus, authMessage(err), { error: true, keep: true });
    }
  };

  async function initSync() {
    const cfg = window.CULTLOG_FIREBASE;
    if (!cfg || !cfg.apiKey) return;
    syncBox.hidden = false;
    renderSync();
    busy(true);
    try {
      const mod = await import('./sync.js');
      sync = await mod.startSync(cfg, syncHandlers);
      busy(false);
    } catch (e) {
      setStatus(syncStatus, '同期の機能を読み込めませんでした。通信できる状態で、もう一度開いてください。', { error: true, keep: true });
    }
  }

  window.addEventListener('online', () => render());
  window.addEventListener('offline', () => render());

  // ---------- init ----------
  function render() {
    renderHero();
    renderFilters();
    renderList();
    renderBackup();
    renderSync();
  }

  // 別タブでの変更を反映
  window.addEventListener('storage', (e) => {
    if (e.key === LOG_KEY) {
      logs = readLogsRaw().map(normLog).filter(Boolean);
      sortLogs();
      render();
    }
  });

  syncChips();
  render();
  initSync();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
