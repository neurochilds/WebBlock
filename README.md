# WebBlock

Don't get stuck on the web.

WebBlock is a Chrome extension for blocking distractions with a simple, strict workflow.  
Block distracting websites, set daily time limits, schedule block windows, or use Tunnel Vision mode to block all but one website.

## Features

- Always block specific sites
- Daily time limits per site
- Scheduled block windows and scheduled allow-only windows
- Tunnel Vision: allow only one site for a fixed duration
- Delayed unblock flow with typed confirmations + cooldown
- Local-first data storage (no external backend)

## Example

### Dashboard

![WebBlock dashboard](screenshots/01-dashboard.png)

### Advanced settings (Tunnel Vision + schedules)

![WebBlock advanced settings](screenshots/02-advanced-settings.png)

### Unblock flow — step 1 (first confirmation)

![WebBlock unblock step 1](screenshots/03-unblock-step-1.png)

### Unblock flow — step 2 (final confirmation)

![WebBlock unblock step 2](screenshots/04-unblock-step-2.png)

### Unblock flow — step 3 (await cooldown)

![WebBlock blocked state](screenshots/05-dashboard-unblocking.png)

## Install (Chrome)

1. Clone this repo.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked**.
5. Select the project folder (`focus-guard`).

That’s it. Pin the extension if you want one-click access from the toolbar.

## Quick Start

1. Add a site as **Always Block** or **Time Limit**.
2. Open **Advanced Settings** for Tunnel Vision and scheduled rules.
3. If you try to remove a block, WebBlock requires explicit typed confirmations and a cooldown.

## Time Tracking Notes

- Time-limit usage tracks the **active tab** in the **focused Chrome window**.
- Usage is stored in seconds and rendered in the UI as minutes/seconds.
- Daily limits reset at local midnight.

## Project Files

- `manifest.json` - Chrome extension manifest (MV3)
- `background.js` - service worker (rules, tracking, alarms, state)
- `popup.html` / `popup.css` / `popup.js` - extension UI
- `blocked.html` / `blocked.js` - blocked-page experience
- `icon16.png`, `icon48.png`, `icon128.png` - extension icons

## License

MIT
