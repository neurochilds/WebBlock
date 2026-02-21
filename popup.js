// WebBlock — popup

let currentMode = 'block';
let schedMode = 'schedule-block';
let modalHost = null;
let finalModalHost = null;

// ─── Utilities ───────────────────────────────────────────────────────────────

function normalizeHost(input) {
  input = (input || '').trim().toLowerCase();
  if (!input) return null;
  if (input.startsWith('http://') || input.startsWith('https://')) {
    try { input = new URL(input).hostname; } catch { return null; }
  } else {
    // Allow pasted domains with a trailing slash, but reject paths/ports/wildcards.
    if (input.endsWith('/')) input = input.slice(0, -1);
    if (/[/:?#@*]/.test(input)) return null;
  }
  if (input.endsWith('.')) input = input.slice(0, -1);
  if (input.startsWith('www.')) input = input.slice(4);
  if (!input.includes('.') || input.includes(' ') || input.length < 3) return null;
  if (/[<>"'&]/.test(input)) return null;
  if (!/^[a-z0-9.-]+$/.test(input)) return null;
  if (input.startsWith('.') || input.endsWith('.') || input.includes('..')) return null;
  const labels = input.split('.');
  if (labels.some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) return null;
  if (labels.every((label) => /^\d+$/.test(label))) return null;
  return input;
}

function formatSeconds(sec) {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m === 0) return `${s}s`;
  if (total < 600) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${m}m`;
}

function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m > 0 ? `${hour}:${String(m).padStart(2,'0')}${period}` : `${hour}${period}`;
}

function faviconUrl(host) {
  return `https://www.google.com/s2/favicons?sz=32&domain_url=${host}`;
}

function send(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

// ─── View switching ───────────────────────────────────────────────────────────

function setAdvancedMode(isAdvanced) {
  document.body.classList.toggle('advanced-mode', isAdvanced);
}

document.getElementById('advancedBtn').addEventListener('click', () => {
  document.getElementById('mainView').style.display = 'none';
  document.getElementById('advancedView').style.display = '';
  setAdvancedMode(true);
});

document.getElementById('backBtn').addEventListener('click', () => {
  document.getElementById('advancedView').style.display = 'none';
  document.getElementById('mainView').style.display = '';
  setAdvancedMode(false);
});

// ─── Unblock modal ────────────────────────────────────────────────────────────

function openModal(host) {
  modalHost = host;
  const phrase1 = `I understand this may hurt my focus, please unblock ${host}`;
  const phrase2 = `I confirm that I want to unblock ${host}`;
  const warning1 = `You set this block to protect your time. Are you sure you want to unblock ${host}?`;

  const prompt1El = document.getElementById('modalPrompt1');
  prompt1El.textContent = '';
  prompt1El.append(warning1);
  prompt1El.appendChild(document.createElement('br'));
  prompt1El.appendChild(document.createElement('br'));
  prompt1El.append('Type the following:');
  prompt1El.appendChild(document.createElement('br'));
  prompt1El.appendChild(document.createElement('br'));
  const strong1 = document.createElement('strong');
  strong1.textContent = phrase1;
  prompt1El.appendChild(strong1);
  prompt1El.appendChild(document.createElement('br'));
  prompt1El.appendChild(document.createElement('br'));
  document.getElementById('modalInput1').value = '';
  document.getElementById('modalHint1').textContent = '';
  document.getElementById('modalConfirm1').disabled = true;

  const prompt2El = document.getElementById('modalPrompt2');
  prompt2El.textContent = '';
  prompt2El.append('Type the following:');
  prompt2El.appendChild(document.createElement('br'));
  prompt2El.appendChild(document.createElement('br'));
  const strong2 = document.createElement('strong');
  strong2.textContent = phrase2;
  prompt2El.appendChild(strong2);
  prompt2El.appendChild(document.createElement('br'));
  prompt2El.appendChild(document.createElement('br'));
  document.getElementById('modalWarning2').textContent =
    `Are you sure you won't regret unblocking ${host}?`;
  document.getElementById('modalInput2').value = '';
  document.getElementById('modalHint2').textContent = '';
  document.getElementById('modalConfirm2').disabled = true;

  document.getElementById('modalStep1').style.display = '';
  document.getElementById('modalStep2').style.display = 'none';
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('modalInput1').focus();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  modalHost = null;
}

function preventPasteLikeInput(e) {
  e.preventDefault();
}

function preventPasteShortcut(e) {
  const key = (e.key || '').toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === 'v') {
    e.preventDefault();
    return;
  }
  if (e.shiftKey && key === 'insert') {
    e.preventDefault();
  }
}

const modalInput1 = document.getElementById('modalInput1');
const modalInput2 = document.getElementById('modalInput2');
for (const input of [modalInput1, modalInput2]) {
  input.addEventListener('paste', preventPasteLikeInput);
  input.addEventListener('drop', preventPasteLikeInput);
  input.addEventListener('keydown', preventPasteShortcut);
}

modalInput1.addEventListener('input', () => {
  if (!modalHost) return;
  const phrase = `I understand this may hurt my focus, please unblock ${modalHost}`;
  const val = modalInput1.value;
  const match = val.toLowerCase() === phrase.toLowerCase();
  document.getElementById('modalConfirm1').disabled = !match;
  document.getElementById('modalHint1').textContent = val.length > 0 && !match ? "Doesn't match — try again." : '';
});

modalInput2.addEventListener('input', () => {
  if (!modalHost) return;
  const phrase = `I confirm that I want to unblock ${modalHost}`;
  const val = modalInput2.value;
  const match = val.toLowerCase() === phrase.toLowerCase();
  document.getElementById('modalConfirm2').disabled = !match;
  document.getElementById('modalHint2').textContent = val.length > 0 && !match ? "Doesn't match — try again." : '';
});

document.getElementById('modalConfirm1').addEventListener('click', () => {
  document.getElementById('modalStep1').style.display = 'none';
  document.getElementById('modalStep2').style.display = '';
  document.getElementById('modalInput2').focus();
});

document.getElementById('modalConfirm2').addEventListener('click', async () => {
  const host = modalHost;
  closeModal();
  await send({ type: 'schedulePendingRemoval', host });
  render();
});

document.getElementById('modalCancel1').addEventListener('click', closeModal);
document.getElementById('modalCancel2').addEventListener('click', closeModal);

// ─── Final confirmation modal ─────────────────────────────────────────────────

function openFinalModal(host) {
  finalModalHost = host;
  document.getElementById('finalModalText').textContent =
    `Are you sure you want to unblock ${host}? Selecting no will keep the block in place, and a new cool-down period will be required to request removal again.`;
  document.getElementById('finalModalOverlay').classList.add('open');
}

function closeFinalModal() {
  document.getElementById('finalModalOverlay').classList.remove('open');
  finalModalHost = null;
}

document.getElementById('finalModalYes').addEventListener('click', async () => {
  const host = finalModalHost;
  closeFinalModal();
  await send({ type: 'confirmFinalUnblock', host });
  render();
});

document.getElementById('finalModalNo').addEventListener('click', async () => {
  const host = finalModalHost;
  closeFinalModal();
  await send({ type: 'cancelPendingRemoval', host });
  render();
});

// ─── Tunnel Vision ────────────────────────────────────────────────────────────

function renderTunnelVision(tv) {
  const activeEl = document.getElementById('tunnelActive');
  const formEl = document.getElementById('tunnelForm');

  if (!tv) { activeEl.style.display = 'none'; formEl.style.display = ''; return; }

  const elapsed = Date.now() - tv.startTime;
  const remaining = tv.durationMinutes * 60 * 1000 - elapsed;

  if (remaining <= 0) { activeEl.style.display = 'none'; formEl.style.display = ''; return; }

  activeEl.style.display = '';
  formEl.style.display = 'none';
  document.getElementById('tunnelCountdown').textContent = formatCountdown(remaining);
  document.getElementById('tunnelAllowedHost').textContent = tv.allowedHost;
  document.getElementById('tunnelFavicon').src = faviconUrl(tv.allowedHost);
}

document.getElementById('tunnelStartBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('tunnelErrorMsg');
  errEl.textContent = '';
  const host = normalizeHost(document.getElementById('tunnelHostInput').value);
  if (!host) { errEl.textContent = 'Enter a valid domain, e.g. gmail.com'; return; }
  const mins = parseInt(document.getElementById('tunnelMinutes').value, 10);
  if (!mins || mins < 1) { errEl.textContent = 'Enter a valid duration'; return; }
  await send({ type: 'startTunnelVision', allowedHost: host, durationMinutes: mins });
  document.getElementById('tunnelHostInput').value = '';
  render();
});

document.getElementById('tunnelEndBtn').addEventListener('click', () => {
  const host = document.getElementById('tunnelAllowedHost').textContent;
  const countdown = document.getElementById('tunnelCountdown').textContent;
  document.getElementById('tunnelCancelText').textContent =
    `You still have ${countdown} left in your session. Only ${host} is allowed until it ends.`;
  document.getElementById('tunnelCancelOverlay').classList.add('open');
});

document.getElementById('tunnelCancelYes').addEventListener('click', async () => {
  document.getElementById('tunnelCancelOverlay').classList.remove('open');
  await send({ type: 'cancelTunnelVision' });
  render();
});

document.getElementById('tunnelCancelNo').addEventListener('click', () => {
  document.getElementById('tunnelCancelOverlay').classList.remove('open');
});

// ─── Scheduled rules ─────────────────────────────────────────────────────────

// Mode toggle for schedule form
document.getElementById('schedBlockBtn').addEventListener('click', () => {
  schedMode = 'schedule-block';
  document.getElementById('schedBlockBtn').classList.add('active');
  document.getElementById('schedAllowBtn').classList.remove('active');
});

document.getElementById('schedAllowBtn').addEventListener('click', () => {
  schedMode = 'schedule-allow';
  document.getElementById('schedAllowBtn').classList.add('active');
  document.getElementById('schedBlockBtn').classList.remove('active');
});

document.getElementById('schedAddBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('schedErrorMsg');
  errEl.textContent = '';

  const host = normalizeHost(document.getElementById('schedHostInput').value);
  if (!host) { errEl.textContent = 'Enter a valid domain'; return; }

  const start = document.getElementById('schedStart').value;
  const end = document.getElementById('schedEnd').value;
  if (!start || !end) { errEl.textContent = 'Set both start and end times'; return; }
  if (start === end) { errEl.textContent = 'Start and end times must differ'; return; }

  const res = await send({ type: 'addSchedule', host, mode: schedMode, scheduleStart: start, scheduleEnd: end });

  if (res && res.conflict) {
    errEl.textContent = res.conflict;
    return;
  }

  document.getElementById('schedHostInput').value = '';
  render();
});

function renderScheduleList(sites) {
  const list = document.getElementById('scheduleList');
  const empty = document.getElementById('scheduleEmpty');
  list.innerHTML = '';

  const scheduled = Object.entries(sites || {}).filter(
    ([, c]) => c.mode === 'schedule-block' || c.mode === 'schedule-allow'
  );

  empty.style.display = scheduled.length === 0 ? 'block' : 'none';

  for (const [host, config] of scheduled) {
    const item = document.createElement('div');
    item.className = 'schedule-item';

    const img = document.createElement('img');
    img.className = 'site-favicon';
    img.src = faviconUrl(host);
    img.onerror = () => { img.style.visibility = 'hidden'; };

    const info = document.createElement('div');
    info.className = 'schedule-item-info';

    const hostEl = document.createElement('div');
    hostEl.className = 'schedule-item-host';
    hostEl.textContent = host;

    const detail = document.createElement('div');
    detail.className = 'schedule-item-detail';
    const action = config.mode === 'schedule-block' ? 'Blocked' : 'Allowed only';
    detail.textContent = `${action} ${formatTime(config.scheduleStart)} – ${formatTime(config.scheduleEnd)}`;

    info.appendChild(hostEl);
    info.appendChild(detail);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => openModal(host));

    item.appendChild(img);
    item.appendChild(info);
    item.appendChild(removeBtn);
    list.appendChild(item);
  }
}

// ─── Main site list rendering ─────────────────────────────────────────────────

function renderSite(host, config, usedSeconds, pendingRemovals, readyToConfirm) {
  const item = document.createElement('div');
  item.className = 'site-item';

  const img = document.createElement('img');
  img.className = 'site-favicon';
  img.src = faviconUrl(host);
  img.onerror = () => { img.style.visibility = 'hidden'; };

  const info = document.createElement('div');
  info.className = 'site-info';

  const hostEl = document.createElement('div');
  hostEl.className = 'site-host';
  hostEl.textContent = host;

  const meta = document.createElement('div');
  meta.className = 'site-meta';

  const isPending = !!pendingRemovals[host];
  const isReadyToConfirm = !!readyToConfirm[host];

  if (isReadyToConfirm) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-pending';
    badge.textContent = 'Final confirmation needed';
    meta.appendChild(badge);

    const btn = document.createElement('button');
    btn.className = 'cancel-pending-btn';
    btn.textContent = 'Review';
    btn.style.borderColor = '#FF9F0A';
    btn.style.color = '#FF9F0A';
    btn.addEventListener('click', () => openFinalModal(host));
    meta.appendChild(btn);

  } else if (isPending) {
    const scheduledAt = pendingRemovals[host];
    const remaining = Math.max(0, 15 * 60 - Math.floor((Date.now() - scheduledAt) / 1000));
    const m = Math.floor(remaining / 60), s = remaining % 60;

    const badge = document.createElement('span');
    badge.className = 'badge badge-pending';
    badge.textContent = `Unblocking in ${m}:${String(s).padStart(2,'0')}`;
    meta.appendChild(badge);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cancel-pending-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', async () => {
      await send({ type: 'cancelPendingRemoval', host });
      render();
    });
    meta.appendChild(cancelBtn);

  } else if (config.mode === 'block') {
    const badge = document.createElement('span');
    badge.className = 'badge badge-block';
    badge.textContent = 'Blocked';
    meta.appendChild(badge);

  } else if (config.mode === 'schedule-block' || config.mode === 'schedule-allow') {
    const isBlock = config.mode === 'schedule-block';
    const label = isBlock ? 'Blocks' : 'Allows only';
    const badge = document.createElement('span');
    badge.className = `badge ${isBlock ? 'badge-sched-block' : 'badge-sched-allow'}`;
    badge.textContent = isBlock ? 'Sched. Block' : 'Sched. Allow';
    meta.appendChild(badge);

    const timeEl = document.createElement('span');
    timeEl.className = 'sched-time';
    timeEl.textContent = `${label} ${formatTime(config.scheduleStart)}–${formatTime(config.scheduleEnd)}`;
    meta.appendChild(timeEl);

  } else {
    // time-limit
    const limitSec = (config.dailyLimit || 0) * 60;
    const pct = limitSec > 0 ? Math.min(100, (usedSeconds / limitSec) * 100) : 0;
    const exceeded = usedSeconds >= limitSec;

    const badge = document.createElement('span');
    badge.className = `badge ${exceeded ? 'badge-exceeded' : 'badge-limit'}`;
    badge.textContent = exceeded ? 'Limit reached' : 'Time limit';
    meta.appendChild(badge);

    const progressWrap = document.createElement('div');
    progressWrap.className = 'progress-wrap';
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = `${pct}%`;
    fill.style.background = exceeded ? '#FF453A' : pct > 70 ? '#FF9F0A' : '#5856D6';
    bar.appendChild(fill);
    const text = document.createElement('div');
    text.className = 'progress-text';
    text.textContent = `${formatSeconds(usedSeconds)} of ${config.dailyLimit}m used`;
    progressWrap.appendChild(bar);
    progressWrap.appendChild(text);
    meta.appendChild(progressWrap);
  }

  info.appendChild(hostEl);
  info.appendChild(meta);

  const locked = isPending || isReadyToConfirm;
  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = '×';
  removeBtn.disabled = locked;
  removeBtn.style.opacity = locked ? '0.2' : '';
  if (!locked) removeBtn.addEventListener('click', () => openModal(host));

  item.appendChild(img);
  item.appendChild(info);
  item.appendChild(removeBtn);
  return item;
}

// ─── Render ───────────────────────────────────────────────────────────────────

async function render() {
  const data = await send({ type: 'getData' });
  if (!data) return;
  const { sites, usage, pendingRemovals, readyToConfirm, tunnelVision } = data;

  // Main site list
  const list = document.getElementById('sitesList');
  const empty = document.getElementById('emptyState');
  list.innerHTML = '';
  const entries = Object.entries(sites || {});
  empty.style.display = entries.length === 0 ? 'block' : 'none';
  for (const [host, config] of entries) {
    list.appendChild(renderSite(host, config, usage[host] || 0, pendingRemovals || {}, readyToConfirm || {}));
  }

  document.getElementById('headerStats').textContent =
    entries.length > 0 ? `${entries.length} site${entries.length !== 1 ? 's' : ''}` : '';

  // Advanced view
  renderTunnelVision(tunnelVision || null);
  renderScheduleList(sites);

  // Auto-open final modal
  if (readyToConfirm && !finalModalHost) {
    const host = Object.keys(readyToConfirm)[0];
    if (host) openFinalModal(host);
  }
}

// ─── Add site (main view) ─────────────────────────────────────────────────────

document.getElementById('blockBtn').addEventListener('click', () => {
  currentMode = 'block';
  document.getElementById('blockBtn').classList.add('active');
  document.getElementById('limitBtn').classList.remove('active');
  document.getElementById('limitRow').classList.remove('visible');
});

document.getElementById('limitBtn').addEventListener('click', () => {
  currentMode = 'limit';
  document.getElementById('limitBtn').classList.add('active');
  document.getElementById('blockBtn').classList.remove('active');
  document.getElementById('limitRow').classList.add('visible');
});

document.getElementById('addBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('errorMsg');
  errEl.textContent = '';
  const host = normalizeHost(document.getElementById('hostInput').value);
  if (!host) { errEl.textContent = 'Enter a valid domain, e.g. youtube.com'; return; }

  const msg = { type: 'addSite', host, mode: currentMode };
  if (currentMode === 'limit') {
    const mins = parseInt(document.getElementById('minutesInput').value, 10);
    if (!mins || mins < 1) { errEl.textContent = 'Enter a valid time limit'; return; }
    msg.dailyLimit = mins;
  }
  const res = await send(msg);
  if (res && res.conflict) { errEl.textContent = res.conflict; return; }
  document.getElementById('hostInput').value = '';
  render();
});

document.getElementById('hostInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('addBtn').click();
});

// ─── Refresh every second (countdowns) ───────────────────────────────────────

setInterval(render, 1000);
render();
