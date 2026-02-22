const params = new URLSearchParams(window.location.search);
const isTunnel = params.get('tunnel') === '1';
const allowedHost = params.get('allowed') || '';
const host = isTunnel ? (allowedHost || 'one site') : (params.get('host') || 'this site');

document.getElementById('hostEl').textContent = isTunnel ? 'Tunnel Vision' : host;

function formatSeconds(sec) {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  if (m === 0) return s + 's';
  if (total < 600) return m + 'm ' + String(s).padStart(2, '0') + 's';
  return m + 'm';
}

function timeUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const sec = Math.floor((midnight - now) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

function formatTime(t) {
  if (!t || typeof t !== 'string' || !/^\d{2}:\d{2}$/.test(t)) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m > 0 ? `${hour}:${String(m).padStart(2, '0')}${period}` : `${hour}${period}`;
}

function formatScheduleDays(days) {
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const valid = Array.isArray(days)
    ? [...new Set(days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
    : allDays;
  const set = new Set(valid.length > 0 ? valid : allDays);
  if (set.size === 7) return 'every day';
  if ([1, 2, 3, 4, 5].every((d) => set.has(d)) && set.size === 5) return 'weekdays';
  if ([0, 6].every((d) => set.has(d)) && set.size === 2) return 'weekends';
  const order = [1, 2, 3, 4, 5, 6, 0];
  const labelMap = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
  return order.filter((d) => set.has(d)).map((d) => labelMap[d]).join(', ');
}

function render(info) {
  const resetEl = document.getElementById('resetInfo');

  // Tunnel vision mode
  if (isTunnel) {
    document.getElementById('headlineEl').textContent = 'Tunnel vision mode.';
    document.getElementById('subtitleEl').textContent = allowedHost
      ? `Only ${allowedHost} is allowed right now.`
      : 'You\'re in tunnel vision mode. Stay focused.';
    return;
  }

  if (!info || !info.config) {
    document.getElementById('headlineEl').textContent = 'This site is blocked.';
    document.getElementById('subtitleEl').textContent = 'You set this up. Stay focused.';
    return;
  }

  const { config, usedSeconds } = info;

  if (config.mode === 'block') {
    document.getElementById('headlineEl').textContent = 'This site is blocked.';
    document.getElementById('subtitleEl').textContent = 'You blocked this site with WebBlock.';
  } else if (config.mode === 'schedule-block') {
    const window = `${formatTime(config.scheduleStart)}–${formatTime(config.scheduleEnd)}`;
    document.getElementById('headlineEl').textContent = 'This site is blocked right now.';
    document.getElementById('subtitleEl').textContent =
      `${host} is blocked on ${formatScheduleDays(config.scheduleDays)} during ${window}.`;
  } else if (config.mode === 'schedule-allow') {
    const window = `${formatTime(config.scheduleStart)}–${formatTime(config.scheduleEnd)}`;
    document.getElementById('headlineEl').textContent = 'Outside allowed hours.';
    document.getElementById('subtitleEl').textContent =
      `${host} is only allowed on ${formatScheduleDays(config.scheduleDays)} during ${window}.`;
  } else {
    const limitSec = (config.dailyLimit || 0) * 60;
    const pct = limitSec > 0 ? Math.min(100, (usedSeconds / limitSec) * 100) : 100;

    document.getElementById('headlineEl').textContent = "Time's up.";
    document.getElementById('subtitleEl').textContent =
      'You\'ve used your daily limit for ' + host + '.';

    const usageBlock = document.getElementById('usageBlock');
    usageBlock.style.display = 'block';
    document.getElementById('usageFill').style.width = pct + '%';
    document.getElementById('usageText').innerHTML =
      '<strong>' + formatSeconds(usedSeconds) + '</strong> used of <strong>' + config.dailyLimit + 'm</strong> limit';
  }

  resetEl.innerHTML = 'Resets in <strong>' + timeUntilMidnight() + '</strong>';
}

if (isTunnel) {
  render(null);
} else {
  try {
    chrome.runtime.sendMessage({ type: 'getBlockedInfo', host }, (info) => {
      if (chrome.runtime.lastError) { render(null); return; }
      render(info);
    });
  } catch {
    render(null);
  }
}
