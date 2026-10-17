/* Browser lifecycle support. No telemetry leaves this device. */
(() => {
  'use strict';
  const MOBILE_RENDER_RATIO = 1.5;
  const MAX_RENDER_PIXELS = 1500000;
  const mobile = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const prefix = 'holdharbor:recovery:v1:' + location.pathname.replace(/[^/]*$/, '') + ':';
  let storageAvailable = true;
  const read = key => { try { return localStorage.getItem(prefix + key); } catch (_) { storageAvailable = false; return null; } };
  const write = (key, value) => { try { localStorage.setItem(prefix + key, value); return true; } catch (_) { storageAvailable = false; return false; } };
  const remove = key => { try { localStorage.removeItem(prefix + key); } catch (_) { storageAvailable = false; } };
  const previousSession = read('session');
  const session = { started: Date.now(), lastSeen: Date.now(), event: 'starting', errors: [] };
  function record(event, detail) {
    session.lastSeen = Date.now(); session.event = event;
    if (detail) session.errors = session.errors.concat(String(detail).slice(0, 300)).slice(-8);
    write('session', JSON.stringify(session));
  }
  record('starting');
  window.addEventListener('error', e => record('error', e.message));
  window.addEventListener('unhandledrejection', e => record('rejection', e.reason && (e.reason.message || e.reason)));
  window.addEventListener('pagehide', () => record('pagehide'));
  document.addEventListener('visibilitychange', () => record(document.hidden ? 'hidden' : 'visible'));
  setInterval(() => { if (!document.hidden) record('active'); }, 15000);
  let canvas = null;
  window.HoldHarborRuntime = {
    mobile,
    putJournal(key, payload) {
      try {
        if (!payload || typeof JSON.parse(payload) !== 'object') return false;
        return write('journal:' + key, JSON.stringify({ at: Date.now(), payload }));
      } catch (_) { return false; }
    },
    loadJournal(key, fileModifiedSeconds) {
      try {
        const item = JSON.parse(read('journal:' + key));
        if (!item || typeof item.payload !== 'string' || item.at < Number(fileModifiedSeconds || 0) * 1000) return '';
        const parsed = JSON.parse(item.payload);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? item.payload : '';
      } catch (_) { return ''; }
    },
    clearJournal(key) { remove('journal:' + key); },
    prepare(config, element) {
      canvas = element;
      canvas.addEventListener('webglcontextlost', () => record('webgl-context-lost'));
      if (mobile) {
        // Godot's native adaptive policy uses uncapped hardware DPR. Own the
        // backing size on phones while leaving its CSS/input rectangle intact.
        config.canvasResizePolicy = 0;
        let queued = false;
        const resize = () => {
          queued = false;
          const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
          const ratio = Math.min(window.devicePixelRatio || 1, MOBILE_RENDER_RATIO, Math.sqrt(MAX_RENDER_PIXELS / (w * h)));
          const width = Math.max(1, Math.round(w * ratio)), height = Math.max(1, Math.round(h * ratio));
          if (canvas.width !== width) canvas.width = width;
          if (canvas.height !== height) canvas.height = height;
          canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
        };
        resize();
        window.addEventListener('resize', () => {
          if (!queued) { queued = true; requestAnimationFrame(resize); }
        });
      }
    },
    diagnostics() {
      return JSON.stringify({ build: 'mobile-stability-1', mobile, storageAvailable,
        viewport: [innerWidth, innerHeight], hardwareDPR: devicePixelRatio,
        backingSize: canvas ? [canvas.width, canvas.height] : null,
        previousSession, session });
    }
  };
})();
