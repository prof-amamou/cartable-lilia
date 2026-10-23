/* Cartable — noyau : utilitaires, client Supabase, dialogues, notifications. */
(function () {
  'use strict';
  const CP = (window.CP = window.CP || {});
  const cfg = (CP.cfg = window.CARTABLE_CONFIG || {});

  /* ---------- DOM ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  CP.$ = $;
  CP.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (CP.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  CP.debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  /* ---------- État partagé ---------- */
  CP.state = { user: null, classes: [], activeClassId: null, student: null };
  try { CP.state.activeClassId = localStorage.getItem('cartable.active') || null; } catch (e) { /* stockage indisponible */ }

  /* ---------- Niveaux (lycée tunisien) ---------- */
  CP.LEVELS = [
    '1ère année Tronc commun',
    '2ème Lettres',
    '3ème Lettres',
    '4ème Lettres',
    '2ème Économie et Services',
    '3ème Économie et Services',
    '4ème Économie et Services',
    'Autre'
  ];
  CP.levelRank = (l) => { const i = CP.LEVELS.indexOf(l); return i < 0 ? 99 : i; };

  /* ---------- Texte, dates, URL ---------- */
  CP.pl = (n, one, many) => n + ' ' + (n > 1 ? many : one);
  CP.today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  CP.fmtDate = (iso) => {
    if (!iso) return '';
    const p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso);
  };
  CP.fmtDateTime = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  };
  CP.longDate = () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  CP.fmtNum = (n) => (Math.round(n * 100) / 100).toString().replace('.', ',');

  /** Ne garde que les liens http(s) : bloque javascript: et autres schémas. */
  CP.safeUrl = (u) => {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try {
      const x = new URL(u);
      return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : '';
    } catch (e) { return ''; }
  };
  CP.linkify = (t) =>
    esc(t).replace(/(https?:\/\/[^\s<]+)/g, (m) => {
      const u = CP.safeUrl(m.replace(/&amp;/g, '&'));
      return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + m + '</a>' : m;
    });

  /* ---------- Code de classe ---------- */
  CP.sha256 = async (value) => {
    if (!window.crypto || !crypto.subtle) throw new Error('Cette page doit être ouverte en HTTPS (ou sur localhost) pour fonctionner.');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  CP.normCode = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
  CP.hashCode = (s) => CP.sha256(CP.normCode(s));
  CP.makeCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 caractères : pas de 0/O/1/I
    const bytes = new Uint8Array(9);
    crypto.getRandomValues(bytes);
    return 'INFO-' + Array.from(bytes).map((b) => chars[b % 32]).join('');
  };
  CP.studentLink = () => location.href.split('#')[0] + '#eleve';

  /* ---------- Supabase ---------- */
  const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.SUPABASE_URL || '');
  CP.configured = !!(urlOk && cfg.SUPABASE_ANON_KEY && !/VOTRE/i.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY));
  CP.db = null;
  if (CP.configured && window.supabase && window.supabase.createClient) {
    CP.db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  CP.fnUrl = String(cfg.SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/student-access';

  CP.must = async (promise) => {
    const res = await promise;
    if (res && res.error) throw res.error;
    return res ? res.data : null;
  };
  /** Lit toutes les lignes d'une table par pages de 1000. */
  CP.fetchAll = async (table, select, build) => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = CP.db.from(table).select(select || '*');
      if (build) q = build(q);
      const rows = await CP.must(q.range(from, from + 999));
      out.push(...(rows || []));
      if (!rows || rows.length < 1000) break;
    }
    return out;
  };

  CP.errMsg = (e) => {
    const m = (e && (e.message || e.error_description || e.msg)) || String(e || 'Erreur inconnue');
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return 'Adresse e-mail non confirmée : ouvrez le message de confirmation reçu.';
    if (/row-level security|permission denied/i.test(m)) return 'Action refusée. Reconnectez-vous, ou vérifiez que supabase/schema.sql a bien été exécuté.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Connexion impossible. Vérifiez votre réseau.';
    if (/does not exist|schema cache|Could not find/i.test(m)) return 'La base n’est pas à jour : exécutez de nouveau supabase/schema.sql dans Supabase (SQL Editor).';
    return m;
  };

  /* ---------- Notifications ---------- */
  let toastTimer;
  CP.toast = (msg, type) => {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (type === 'err' ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), type === 'err' ? 6500 : 3200);
  };

  /* ---------- Boîtes de dialogue ---------- */
  function openDialog(html, onClose) {
    const d = document.createElement('dialog');
    d.className = 'dlg';
    d.innerHTML = html;
    d.addEventListener('close', () => { onClose(d); d.remove(); });
    document.body.appendChild(d);
    d.showModal();
    return d;
  }
  CP.confirm = (message, o = {}) =>
    new Promise((res) => {
      openDialog(
        '<form method="dialog"><h3>' + esc(o.title || 'Confirmation') + '</h3><p>' + esc(message) + '</p>' +
          '<div class="dlg-actions"><button value="no" class="btn">Annuler</button>' +
          '<button value="yes" class="btn ' + (o.danger ? 'btn-danger-solid' : 'btn-primary') + '">' + esc(o.ok || 'Confirmer') + '</button></div></form>',
        (d) => res(d.returnValue === 'yes')
      );
    });
  CP.promptText = (title, label, value) =>
    new Promise((res) => {
      const d = openDialog(
        '<form method="dialog"><h3>' + esc(title) + '</h3><label class="field">' + esc(label) +
          '<input name="v" maxlength="120" required value="' + esc(value || '') + '"></label>' +
          '<div class="dlg-actions"><button value="no" formnovalidate class="btn">Annuler</button>' +
          '<button value="yes" class="btn btn-primary">Enregistrer</button></div></form>',
        (dlg) => res(dlg.returnValue === 'yes' ? dlg.querySelector('input').value.trim() || null : null)
      );
      d.querySelector('input').select();
    });
  /** Affiche le code (une seule fois). Échap est désactivé pour éviter de le perdre. */
  CP.showCode = (className, code) =>
    new Promise((res) => {
      const link = CP.studentLink();
      const d = openDialog(
        '<form method="dialog"><h3>Code de la classe</h3>' +
          '<p>Code d’accès de <b>' + esc(className) + '</b>. Il n’est affiché qu’une seule fois : notez-le ou copiez-le maintenant.</p>' +
          '<p class="bigcode">' + esc(code) + '</p>' +
          '<p class="muted">Page des élèves : <span class="mono">' + esc(link) + '</span></p>' +
          '<div class="dlg-actions"><button type="button" class="btn" data-c="code">Copier le code</button>' +
          '<button type="button" class="btn" data-c="msg">Copier le message pour les élèves</button>' +
          '<button value="ok" class="btn btn-primary">J’ai noté le code</button></div></form>',
        () => res()
      );
      d.addEventListener('cancel', (e) => e.preventDefault());
      d.addEventListener('click', (e) => {
        const b = e.target.closest('[data-c]');
        if (!b) return;
        CP.copy(b.dataset.c === 'code' ? code : 'Classe ' + className + '\nPage des élèves : ' + link + '\nCode d’accès : ' + code);
      });
    });

  /* ---------- Presse-papiers, téléchargement, scripts ---------- */
  CP.copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      CP.toast('Copié dans le presse-papiers.');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); CP.toast('Copié dans le presse-papiers.'); }
      catch (e2) { CP.toast('Copie impossible : sélectionnez le texte à la main.', 'err'); }
      ta.remove();
    }
  };
  CP.download = (filename, text, mime) => {
    const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  /** CSV compatible Excel français (séparateur « ; », BOM UTF-8). */
  CP.csv = (rows) =>
    '\ufeff' + rows.map((r) => r.map((c) => {
      const s = String(c == null ? '' : c);
      return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');

  const scripts = {};
  CP.loadScript = (src) =>
    scripts[src] || (scripts[src] = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = ok;
      s.onerror = () => { delete scripts[src]; ko(new Error('Chargement impossible : ' + src)); };
      document.head.appendChild(s);
    }));
})();
