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
    document.getElementById('headlineEl').textContent = 'This site is blocked right now.';
    document.getElementById('subtitleEl').textContent =
      host + ' is scheduled to be blocked during these hours.';
  } else if (config.mode === 'schedule-allow') {
    document.getElementById('headlineEl').textContent = 'Outside allowed hours.';
    document.getElementById('subtitleEl').textContent =
      host + ' is only allowed during its scheduled window.';
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
