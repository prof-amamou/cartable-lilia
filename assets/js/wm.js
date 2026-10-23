/* Cartable — gestionnaire de fenêtres : chaque commande s'ouvre dans sa propre fenêtre
   (déplaçable, redimensionnable, réductible), avec une barre des fenêtres ouvertes. */
(function () {
  'use strict';
  const CP = window.CP, $ = CP.$, esc = CP.esc;
  const wm = (CP.wm = {});
  const wins = new Map();
  let z = 20, seq = 0, cascade = 0, topWin = null;
  const GKEY = 'cartable.geo.v1';

  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
  const geoAll = () => { try { return JSON.parse(localStorage.getItem(GKEY) || '{}'); } catch (e) { return {}; } };
  const saveGeo = (id, g) => { try { const a = geoAll(); a[id] = g; localStorage.setItem(GKEY, JSON.stringify(a)); } catch (e) { /* ignoré */ } };

  /* ---------- Classes : options groupées par niveau ---------- */
  CP.classOptions = (sel) => {
    const groups = {};
    CP.state.classes.forEach((c) => (groups[c.level] = groups[c.level] || []).push(c));
    const levels = Object.keys(groups).sort((a, b) => CP.levelRank(a) - CP.levelRank(b) || a.localeCompare(b, 'fr'));
    return levels.map((l) =>
      '<optgroup label="' + esc(l) + '">' +
        groups[l].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }))
          .map((c) => '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
      '</optgroup>').join('');
  };
  const className = (id) => { const c = CP.state.classes.find((x) => x.id === id); return c ? c.name : ''; };

  /** Intercalaire du lanceur (utilisé par l'espace professeur et l'espace élève). */
  CP.tile = (cmd) =>
    '<button type="button" class="tile" data-open="' + cmd.id + '" style="--tab:' + cmd.color + '">' +
      '<span class="tile-ico" aria-hidden="true">' + cmd.icon + '</span>' +
      '<span class="tile-txt"><b>' + esc(cmd.label) + '</b><small>' + esc(cmd.desc || '') + '</small></span>' +
      '<span class="open-flag">ouverte</span></button>';

  /* ---------- Géométrie ---------- */
  function persist(win) {
    if (win.max || isMobile()) return;
    const el = win.el;
    saveGeo(win.cmd.id, { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
  }
  function place(win, from) {
    if (isMobile()) return;
    const L = $('#winlayer'), W = L.clientWidth, H = L.clientHeight, el = win.el, cmd = win.cmd;
    const g = geoAll()[cmd.id] || {};
    let w = Math.min(g.w || cmd.w || 720, W - 16), h = Math.min(g.h || cmd.h || 560, H - 16);
    w = Math.max(w, Math.min(340, W - 16));
    h = Math.max(h, Math.min(260, H - 16));
    let x, y;
    if (from) { x = from.el.offsetLeft + 32; y = from.el.offsetTop + 32; }
    else if (g.x != null && ![...wins.values()].some((o) => o !== win && o.cmd === cmd)) { x = g.x; y = g.y; }
    else { const n = cascade++ % 7; x = (W - w) / 2 + (n - 3) * 28; y = 14 + n * 28; }
    x = Math.min(Math.max(8, x), Math.max(8, W - w - 8));
    y = Math.min(Math.max(8, y), Math.max(8, H - h - 8));
    Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  }

  function attachDrag(win) {
    const bar = $('.win-bar', win.el), el = win.el;
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button,select,input,a') || isMobile() || win.max) return;
      const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop, L = $('#winlayer');
      bar.setPointerCapture(e.pointerId);
      const move = (ev) => {
        el.style.left = Math.min(Math.max(ox + ev.clientX - sx, 60 - el.offsetWidth), L.clientWidth - 60) + 'px';
        el.style.top = Math.min(Math.max(oy + ev.clientY - sy, 0), L.clientHeight - 40) + 'px';
      };
      const up = () => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        bar.removeEventListener('pointercancel', up);
        persist(win);
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
      bar.addEventListener('pointercancel', up);
    });
    bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button,select')) toggleMax(win); });
  }
  function attachResize(win) {
    const el = win.el;
    [['rz-r', 1, 0], ['rz-b', 0, 1], ['rz-br', 1, 1]].forEach(([cls, dx, dy]) => {
      const h = $('.' + cls, el);
      h.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || win.max || isMobile()) return;
        e.preventDefault();
        h.setPointerCapture(e.pointerId);
        const sx = e.clientX, sy = e.clientY, ow = el.offsetWidth, oh = el.offsetHeight, L = $('#winlayer');
        const move = (ev) => {
          if (dx) el.style.width = Math.min(Math.max(320, ow + ev.clientX - sx), L.clientWidth - el.offsetLeft) + 'px';
          if (dy) el.style.height = Math.min(Math.max(220, oh + ev.clientY - sy), L.clientHeight - el.offsetTop) + 'px';
        };
        const up = () => {
          h.removeEventListener('pointermove', move);
          h.removeEventListener('pointerup', up);
          h.removeEventListener('pointercancel', up);
          persist(win);
        };
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
        h.addEventListener('pointercancel', up);
      });
    });
  }

  /* ---------- États : focus, réduire, agrandir, fermer ---------- */
  function visibleByZ() {
    return [...wins.values()].filter((w) => !w.min).sort((a, b) => (+b.el.style.zIndex || 0) - (+a.el.style.zIndex || 0));
  }
  function focus(win) {
    if (!win || win.min) return;
    win.el.style.zIndex = ++z;
    wins.forEach((w) => w.el.classList.toggle('is-top', w === win));
    topWin = win;
    updateBar();
    if (!win.el.contains(document.activeElement)) win.el.focus({ preventScroll: true });
  }
  function minimize(win, on) {
    win.min = on;
    win.el.classList.toggle('min', on);
    if (on && topWin === win) {
      topWin = null;
      wins.forEach((w) => w.el.classList.remove('is-top'));
      const next = visibleByZ()[0];
      if (next) focus(next);
    }
    updateBar();
  }
  function toggleMax(win) {
    const el = win.el;
    if (win.max) {
      win.max = false; el.classList.remove('max');
      if (win.restore) Object.assign(el.style, win.restore);
    } else {
      win.restore = { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height };
      win.max = true; el.classList.add('max');
    }
    $('[data-w="max"]', el).setAttribute('aria-label', win.max ? 'Restaurer' : 'Agrandir');
  }
  function close(win) {
    if (!wins.has(win.id)) return;
    win.dead = true;
    if (win.cmd.onClose) { try { win.cmd.onClose(win); } catch (e) { /* ignoré */ } }
    win.el.remove();
    wins.delete(win.id);
    if (topWin === win) {
      topWin = null;
      const next = visibleByZ()[0];
      if (next) focus(next);
    }
    updateBar();
  }
  function print(win) {
    CP.$$('details', win.el).forEach((d) => (d.open = true));
    document.body.classList.add('printing');
    win.el.classList.add('print-target');
    const done = () => {
      document.body.classList.remove('printing');
      win.el.classList.remove('print-target');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 30);
  }

  function updateBar() {
    const bar = $('#taskbar'), list = $('#taskbar-list');
    if (!bar || !list) return;
    bar.hidden = wins.size === 0;
    list.innerHTML = [...wins.values()].map((w) =>
      '<button type="button" class="tb-item' + (w === topWin && !w.min ? ' on' : '') + (w.min ? ' min' : '') +
      '" data-tb="' + w.id + '" style="--tab:' + w.cmd.color + '" aria-pressed="' + (w === topWin && !w.min) + '">' +
      '<span aria-hidden="true">' + w.cmd.icon + '</span><span class="tb-label">' + esc(w.cmd.label) +
      (className(w.state.classId) ? ' · ' + esc(className(w.state.classId)) : '') + '</span></button>').join('');
    if (CP.app && CP.app.markOpen) CP.app.markOpen();
  }

  /* ---------- Rendu du contenu ---------- */
  async function render(win) {
    if (win.dead) return;
    const b = win.body;
    if (win.cmd.needsClass && !win.state.classId) {
      b.innerHTML = '<div class="empty"><p>Aucune classe n’est encore disponible.</p>' +
        '<button type="button" class="btn btn-primary" data-w-classes>Créer une classe</button></div>';
      return;
    }
    b.setAttribute('aria-busy', 'true');
    try {
      await win.cmd.render(win);
    } catch (e) {
      if (win.dead) return;
      console.error(e);
      b.innerHTML = '<div class="callout err"><b>Cette fenêtre n’a pas pu se charger.</b><br>' + esc(CP.errMsg(e)) +
        '</div><p><button type="button" class="btn" data-w-retry>Réessayer</button></p>';
    } finally {
      b.removeAttribute('aria-busy');
    }
  }
  function syncSel(win) {
    const s = $('.win-class', win.el);
    if (s) {
      s.innerHTML = CP.classOptions(win.state.classId) || '<option value="">Aucune classe</option>';
      if (win.state.classId) s.value = win.state.classId;
    }
    const sub = className(win.state.classId);
    $('.win-sub', win.el).textContent = sub ? ' — ' + sub : '';
  }

  /* ---------- Ouverture ---------- */
  wm.open = function (cmd, opts) {
    opts = opts || {};
    if (!opts.fresh) {
      const ex = [...wins.values()].find((w) => w.cmd === cmd);
      if (ex) {
        if (ex.min) minimize(ex, false);
        if (opts.classId && cmd.needsClass && ex.state.classId !== opts.classId) {
          ex.state.classId = opts.classId; syncSel(ex); render(ex);
        }
        focus(ex);
        return ex;
      }
    }
    const first = CP.state.classes[0];
    const win = {
      id: 'w' + (++seq), cmd, min: false, max: false, rt: 0, dead: false,
      state: { classId: cmd.needsClass ? opts.classId || CP.state.activeClassId || (first && first.id) || null : null }
    };
    const el = (win.el = document.createElement('section'));
    el.className = 'win';
    el.tabIndex = -1;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', cmd.label);
    el.style.setProperty('--tab', cmd.color || '#2f4fd1');
    el.innerHTML =
      '<header class="win-bar"><span class="win-ico" aria-hidden="true">' + cmd.icon + '</span>' +
      '<h2 class="win-title">' + esc(cmd.label) + '<span class="win-sub"></span></h2>' +
      '<div class="win-ctl np">' +
      (cmd.single ? '' : '<button type="button" data-w="dup" title="Ouvrir une seconde fenêtre" aria-label="Dupliquer la fenêtre">⧉</button>') +
      '<button type="button" data-w="print" title="Imprimer cette fenêtre" aria-label="Imprimer">🖨</button>' +
      '<button type="button" data-w="min" title="Réduire" aria-label="Réduire">–</button>' +
      '<button type="button" data-w="max" title="Agrandir" aria-label="Agrandir">▢</button>' +
      '<button type="button" data-w="close" title="Fermer" aria-label="Fermer">✕</button></div></header>' +
      (cmd.needsClass ? '<div class="win-tools np"><label>Classe <select class="win-class" aria-label="Classe de cette fenêtre"></select></label></div>' : '') +
      '<div class="win-body"></div><i class="rz rz-r"></i><i class="rz rz-b"></i><i class="rz rz-br"></i>';
    win.body = $('.win-body', el);
    wins.set(win.id, win);
    $('#winlayer').appendChild(el);
    place(win, opts.from || null);
    syncSel(win);

    /* Commandes de la barre de titre */
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]');
      if (!b || !el.contains(b)) return;
      const a = b.dataset.w;
      if (a === 'close') close(win);
      else if (a === 'min') minimize(win, true);
      else if (a === 'max') toggleMax(win);
      else if (a === 'print') print(win);
      else if (a === 'dup') wm.open(cmd, { fresh: true, classId: win.state.classId, from: win });
    });
    el.addEventListener('pointerdown', () => { if (topWin !== win) focus(win); });
    const sel = $('.win-class', el);
    if (sel) sel.addEventListener('change', () => { win.state.classId = sel.value || null; win.state.editId = null; syncSel(win); updateBar(); render(win); });
    attachDrag(win);
    attachResize(win);

    /* Délégation d'événements du contenu (aucun gestionnaire en ligne : compatible CSP) */
    const run = (fn, ...args) => {
      try {
        const r = fn.apply(cmd, args);
        if (r && r.catch) r.catch((err) => CP.toast(CP.errMsg(err), 'err'));
      } catch (err) { CP.toast(CP.errMsg(err), 'err'); }
    };
    win.body.addEventListener('click', (e) => {
      if (e.target.closest('[data-w-retry]')) return render(win);
      if (e.target.closest('[data-w-classes]')) return wm.open(CP.commands.classes);
      const t = e.target.closest('[data-act]');
      if (t && win.body.contains(t) && cmd.click && cmd.click[t.dataset.act]) run(cmd.click[t.dataset.act], win, t, e);
    });
    win.body.addEventListener('submit', (e) => {
      const f = e.target.closest('form[data-submit]');
      if (!f) return;
      e.preventDefault();
      if (cmd.submit && cmd.submit[f.dataset.submit]) run(cmd.submit[f.dataset.submit], win, f, e);
    });
    ['change', 'input'].forEach((type) =>
      win.body.addEventListener(type, (e) => {
        const t = e.target.closest('[data-' + type + ']');
        const fn = t && cmd[type] && cmd[type][t.getAttribute('data-' + type)];
        if (fn) run(fn, win, t, e);
      }));

    focus(win);
    render(win);
    return win;
  };

  /* ---------- API publique ---------- */
  wm.render = render;
  wm.close = close;
  wm.closeAll = () => [...wins.values()].forEach(close);
  wm.list = () => [...wins.values()];
  /** Met à jour les sélecteurs de classe de toutes les fenêtres (sans recharger leur contenu). */
  wm.syncClasses = () => {
    const first = CP.state.classes[0];
    wins.forEach((w) => {
      if (!w.cmd.needsClass) return;
      if (!CP.state.classes.some((c) => c.id === w.state.classId)) {
        w.state.classId = CP.state.activeClassId || (first && first.id) || null;
        w.state.editId = null;
        render(w);
      }
      syncSel(w);
    });
    updateBar();
  };
  /** Recharge les fenêtres qui dépendent des tables modifiées (sauf celle d'origine). */
  wm.refresh = (tables, except) => {
    wins.forEach((w) => {
      if (w === except || !w.cmd.tables) return;
      if (w.cmd.tables.some((t) => tables.indexOf(t) >= 0)) render(w);
    });
  };
  wm.init = () => {
    $('#taskbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tb]');
      if (b) {
        const w = wins.get(b.dataset.tb);
        if (!w) return;
        if (w.min) { minimize(w, false); focus(w); }
        else if (w === topWin) minimize(w, true);
        else focus(w);
        return;
      }
      if (e.target.closest('#tb-min')) wins.forEach((w) => minimize(w, true));
      if (e.target.closest('#tb-close')) wm.closeAll();
    });
    window.addEventListener('resize', CP.debounce(() => {
      if (isMobile()) return;
      const L = $('#winlayer');
      wins.forEach((w) => {
        if (w.max) return;
        const el = w.el;
        el.style.left = Math.max(0, Math.min(el.offsetLeft, L.clientWidth - 80)) + 'px';
        el.style.top = Math.max(0, Math.min(el.offsetTop, L.clientHeight - 40)) + 'px';
      });
    }, 150));
  };
})();
