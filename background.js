// WebBlock — background service worker

const ALARM_NAME = 'selfBlocTick';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getHost(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    let h = u.hostname;
    if (h.startsWith('www.')) h = h.slice(4);
    return h;
  } catch {
    return null;
  }
}

function isValidConfiguredHost(host) {
  if (typeof host !== 'string') return false;
  const h = host.trim().toLowerCase();
  if (!h || h.includes(' ') || !h.includes('.')) return false;
  if (!/^[a-z0-9.-]+$/.test(h)) return false;
  if (h.startsWith('.') || h.endsWith('.') || h.includes('..')) return false;
  const labels = h.split('.');
  if (labels.some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) return false;
  if (labels.every((label) => /^\d+$/.test(label))) return false;
  return true;
}

function todayKey() {
  // Use local date so daily limits reset at local midnight.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

async function getSites() {
  const { sites } = await chrome.storage.local.get('sites');
  return sites || {};
}

async function saveSites(sites) {
  await chrome.storage.local.set({ sites });
}

// Returns usage map { host: seconds }, resetting if it's a new day
async function getUsage() {
  const { usage, usageDate } = await chrome.storage.local.get(['usage', 'usageDate']);
  const today = todayKey();
  if (usageDate !== today) {
    await chrome.storage.local.set({ usage: {}, usageDate: today });
    return {};
  }
  return usage || {};
}

async function addUsage(host, seconds) {
  if (seconds <= 0) return null;
  const usage = await getUsage();
  usage[host] = (usage[host] || 0) + seconds;
  await chrome.storage.local.set({ usage, usageDate: todayKey() });
  return usage;
}

// ─── Tracking (session-scoped — survives SW restarts, clears on browser close) ─

async function getTracking() {
  const { tracking } = await chrome.storage.session.get('tracking');
  return tracking || null;
}

async function setTracking(host) {
  if (host) {
    await chrome.storage.session.set({ tracking: { host, startTime: Date.now() } });
  } else {
    await chrome.storage.session.remove('tracking');
  }
}

async function flushTracking() {
  const tracking = await getTracking();
  if (!tracking) return;

  const elapsed = Math.round((Date.now() - tracking.startTime) / 1000);
  // Reset start time immediately so next flush doesn't double-count
  await chrome.storage.session.set({ tracking: { ...tracking, startTime: Date.now() } });

  if (elapsed <= 0 || elapsed > 7200) return; // sanity check

  const usage = await addUsage(tracking.host, elapsed);
  if (!usage) return;

  // Check if limit just exceeded
  const sites = await getSites();
  const config = sites[tracking.host];
  if (config?.mode === 'limit' && usage[tracking.host] >= config.dailyLimit * 60) {
    await updateRules();
    await redirectOpenTabs(tracking.host);
  }
}

async function startTrackingTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const host = getHost(tab.url);
    const sites = await getSites();
    if (host && sites[host]?.mode === 'limit') {
      await setTracking(host);
    } else {
      await setTracking(null);
    }
  } catch {
    await setTracking(null);
  }
}

async function onActiveTabChanged(tabId) {
  await flushTracking();
  if (tabId != null) await startTrackingTab(tabId);
}

async function syncTrackingWithActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await startTrackingTab(tab.id);
    } else {
      await setTracking(null);
    }
  } catch {
    await setTracking(null);
  }
}

// ─── Force-redirect open tabs on a host ─────────────────────────────────────

async function redirectOpenTabs(host) {
  const blockedUrl = chrome.runtime.getURL(`/blocked.html?host=${encodeURIComponent(host)}`);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      const tabHost = getHost(tab.url);
      if (tabHost === host) {
        chrome.tabs.update(tab.id, { url: blockedUrl });
      }
    } catch {}
  }
}

// ─── Schedule helpers ────────────────────────────────────────────────────────

function parseTimeToMinutes(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function normalizeScheduleDays(days) {
  if (!Array.isArray(days) || days.length === 0) return [...ALL_DAYS];
  const unique = [...new Set(
    days
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  )];
  return unique.length > 0 ? unique.sort((a, b) => a - b) : [...ALL_DAYS];
}

function isInTimeWindowOnDays(start, end, scheduleDays) {
  const s = parseTimeToMinutes(start);
  const e = parseTimeToMinutes(end);
  if (s == null || e == null || s === e) return false;

  const activeDays = new Set(normalizeScheduleDays(scheduleDays));
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const today = now.getDay();
  const yesterday = (today + 6) % 7;

  // If start < end: same-day window (e.g. 09:00–17:00)
  if (s < e) {
    return activeDays.has(today) && cur >= s && cur < e;
  }
  // If start > end: overnight window (e.g. 20:00–08:00)
  if (cur >= s) return activeDays.has(today);
  return cur < e && activeDays.has(yesterday);
}

// ─── Tunnel Vision ───────────────────────────────────────────────────────────

async function getTunnelVision() {
  const { tunnelVision } = await chrome.storage.local.get('tunnelVision');
  return tunnelVision || null;
}

async function processTunnelVision() {
  const tv = await getTunnelVision();
  if (!tv) return;
  const elapsed = Date.now() - tv.startTime;
  if (elapsed >= tv.durationMinutes * 60 * 1000) {
    await chrome.storage.local.remove('tunnelVision');
    // updateRules() is called by the alarm handler after this
  }
}

async function redirectAllTabsForTunnelVision(allowedHost) {
  const blockedUrl = chrome.runtime.getURL(
    `/blocked.html?tunnel=1&allowed=${encodeURIComponent(allowedHost)}`
  );
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      const tabHost = getHost(tab.url);
      if (tabHost && tabHost !== allowedHost) {
        chrome.tabs.update(tab.id, { url: blockedUrl });
      }
    } catch {}
  }
}

// ─── Rules ───────────────────────────────────────────────────────────────────

async function updateRules() {
  const sites = await getSites();
  const usage = await getUsage();
  const tv = await getTunnelVision();

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map(r => r.id);

  const addRules = [];
  const blockedHosts = new Set();
  let id = 1;

  // Per-site block/limit/schedule rules
  for (const [host, config] of Object.entries(sites)) {
    if (!isValidConfiguredHost(host) || !config || typeof config !== 'object') continue;
    const usedSec = usage[host] || 0;
    let shouldBlock = false;

    if (config.mode === 'block') {
      shouldBlock = true;
    } else if (config.mode === 'limit') {
      shouldBlock = config.dailyLimit > 0 && usedSec >= config.dailyLimit * 60;
    } else if (config.mode === 'schedule-block') {
      shouldBlock = isInTimeWindowOnDays(config.scheduleStart, config.scheduleEnd, config.scheduleDays);
    } else if (config.mode === 'schedule-allow') {
      shouldBlock = !isInTimeWindowOnDays(config.scheduleStart, config.scheduleEnd, config.scheduleDays);
    }

    if (shouldBlock) {
      blockedHosts.add(host);
      addRules.push({
        id: id++,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: { extensionPath: `/blocked.html?host=${encodeURIComponent(host)}` }
        },
        condition: {
          requestDomains: [host],
          resourceTypes: ['main_frame']
        }
      });
    }
  }

  // Tunnel vision: block everything except the allowed host
  if (tv && isValidConfiguredHost(tv.allowedHost)) {
    const elapsed = Date.now() - tv.startTime;
    if (elapsed < tv.durationMinutes * 60 * 1000) {
      // Block all HTTP/HTTPS navigation (priority 10)
      addRules.push({
        id: 9001,
        priority: 10,
        action: {
          type: 'redirect',
          redirect: {
            extensionPath: `/blocked.html?tunnel=1&allowed=${encodeURIComponent(tv.allowedHost)}`
          }
        },
        condition: {
          urlFilter: '*',
          resourceTypes: ['main_frame']
        }
      });
      // Allow the one permitted host (priority 20 — beats the block above)
      addRules.push({
        id: 9002,
        priority: 20,
        action: { type: 'allow' },
        condition: {
          requestDomains: [tv.allowedHost],
          resourceTypes: ['main_frame']
        }
      });
    }
  } else if (tv) {
    // Defensive cleanup in case older invalid data exists in storage.
    await chrome.storage.local.remove('tunnelVision');
  }

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });

  // DNR only affects future navigations. Redirect currently open matching tabs now.
  for (const host of blockedHosts) {
    await redirectOpenTabs(host);
  }
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  try {
    const win = await chrome.windows.get(windowId);
    if (win.focused) await onActiveTabChanged(tabId);
  } catch {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id === tabId) await onActiveTabChanged(tabId);
  } catch {}
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await flushTracking();
    await setTracking(null);
  } else {
    try {
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (tab) await onActiveTabChanged(tab.id);
    } catch {}
  }
});

const UNBLOCK_DELAY_MS = 15 * 60 * 1000; // 15 minutes

async function processPendingRemovals() {
  const { pendingRemovals = {}, readyToConfirm = {} } = await chrome.storage.local.get(['pendingRemovals', 'readyToConfirm']);

  const now = Date.now();
  let changed = false;

  for (const [host, scheduledAt] of Object.entries(pendingRemovals)) {
    if (now - scheduledAt >= UNBLOCK_DELAY_MS) {
      // Move from pendingRemovals → readyToConfirm (final confirmation step)
      readyToConfirm[host] = true;
      delete pendingRemovals[host];
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ pendingRemovals, readyToConfirm });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await getUsage(); // handles day reset
  await flushTracking();
  await processPendingRemovals();
  await processTunnelVision();
  await updateRules(); // re-evaluate schedule-based rules every minute
});

// ─── Init ────────────────────────────────────────────────────────────────────

async function initialize() {
  await getUsage(); // handles day reset
  await updateRules();

  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  }

  await syncTrackingWithActiveTab();
}

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);

// ─── Message Handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {

      case 'getData': {
        await flushTracking();
        await processPendingRemovals();
        await processTunnelVision();
        const sites = await getSites();
        const usage = await getUsage();
        const { pendingRemovals = {}, readyToConfirm = {} } = await chrome.storage.local.get(['pendingRemovals', 'readyToConfirm']);
        const tunnelVision = await getTunnelVision();
        sendResponse({ sites, usage, pendingRemovals, readyToConfirm, tunnelVision });
        break;
      }

      case 'startTunnelVision': {
        await chrome.storage.local.set({
          tunnelVision: {
            allowedHost: msg.allowedHost,
            startTime: Date.now(),
            durationMinutes: msg.durationMinutes
          }
        });
        await updateRules();
        await syncTrackingWithActiveTab();
        await redirectAllTabsForTunnelVision(msg.allowedHost);
        sendResponse({ ok: true });
        break;
      }

      case 'cancelTunnelVision': {
        await chrome.storage.local.remove('tunnelVision');
        await updateRules();
        await syncTrackingWithActiveTab();
        sendResponse({ ok: true });
        break;
      }

      case 'addSite': {
        const sites = await getSites();
        const prev = sites[msg.host];
        if (prev && (prev.mode === 'schedule-block' || prev.mode === 'schedule-allow')) {
          sendResponse({ conflict: `${msg.host} has a scheduled rule. Remove it first.` });
          break;
        }
        sites[msg.host] = { mode: msg.mode, dailyLimit: msg.dailyLimit ?? null };
        await saveSites(sites);
        await updateRules();
        await syncTrackingWithActiveTab();
        sendResponse({ ok: true });
        break;
      }

      case 'addSchedule': {
        const sites = await getSites();
        const existing = sites[msg.host];
        const startMin = parseTimeToMinutes(msg.scheduleStart);
        const endMin = parseTimeToMinutes(msg.scheduleEnd);
        const scheduleDays = normalizeScheduleDays(msg.scheduleDays);

        if (!isValidConfiguredHost(msg.host)) {
          sendResponse({ error: 'Invalid host.' });
          break;
        }
        if (msg.mode !== 'schedule-block' && msg.mode !== 'schedule-allow') {
          sendResponse({ error: 'Invalid schedule mode.' });
          break;
        }
        if (startMin == null || endMin == null || startMin === endMin) {
          sendResponse({ error: 'Invalid schedule times.' });
          break;
        }
        if (scheduleDays.length === 0) {
          sendResponse({ error: 'Pick at least one day.' });
          break;
        }

        // Conflict detection
        if (existing) {
          if (existing.mode === 'block') {
            sendResponse({ conflict: `${msg.host} is already always-blocked. Remove it first.` });
            break;
          }
          if (existing.mode === 'limit') {
            sendResponse({ conflict: `${msg.host} already has a time limit. Remove it first.` });
            break;
          }
        }

        sites[msg.host] = {
          mode: msg.mode,
          scheduleStart: msg.scheduleStart,
          scheduleEnd: msg.scheduleEnd,
          scheduleDays
        };
        await saveSites(sites);
        await updateRules();
        await syncTrackingWithActiveTab();
        sendResponse({ ok: true });
        break;
      }

      case 'schedulePendingRemoval': {
        const { pendingRemovals = {} } = await chrome.storage.local.get('pendingRemovals');
        pendingRemovals[msg.host] = Date.now();
        await chrome.storage.local.set({ pendingRemovals });
        sendResponse({ ok: true });
        break;
      }

      case 'cancelPendingRemoval': {
        const { pendingRemovals = {}, readyToConfirm = {} } = await chrome.storage.local.get(['pendingRemovals', 'readyToConfirm']);
        delete pendingRemovals[msg.host];
        delete readyToConfirm[msg.host];
        await chrome.storage.local.set({ pendingRemovals, readyToConfirm });
        sendResponse({ ok: true });
        break;
      }

      case 'confirmFinalUnblock': {
        // User confirmed final step — actually remove the site
        const { readyToConfirm = {} } = await chrome.storage.local.get('readyToConfirm');
        delete readyToConfirm[msg.host];
        await chrome.storage.local.set({ readyToConfirm });
        const sites = await getSites();
        delete sites[msg.host];
        await saveSites(sites);
        await updateRules();
        await syncTrackingWithActiveTab();
        sendResponse({ ok: true });
        break;
      }

      case 'getBlockedInfo': {
        const sites = await getSites();
        const usage = await getUsage();
        sendResponse({
          config: sites[msg.host] ?? null,
          usedSeconds: usage[msg.host] ?? 0
        });
        break;
      }
    }
  })();
  return true; // keep async channel open
});
