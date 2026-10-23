/* Cartable — espace élèves : accès par code de classe, chaque outil dans sa fenêtre. */
(function () {
  'use strict';
  const CP = window.CP, $ = CP.$, esc = CP.esc, S = CP.state;
  const cmds = (CP.commands = CP.commands || {});
  const St = (CP.student = {});
  const SKEY = 'cartable.student';

  const def = (id, o) => {
    o.id = id;
    ['click', 'submit', 'change', 'input'].forEach((k) => (o[k] = o[k] || {}));
    cmds[id] = o;
    return o;
  };

  /* ---------- Appel de la fonction Edge « student-access » ---------- */
  CP.studentCall = async (payload) => {
    let r;
    try {
      r = await fetch(CP.fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CP.cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CP.cfg.SUPABASE_ANON_KEY },
        body: JSON.stringify(payload)
      });
    } catch (e) { throw new Error('Connexion impossible. Vérifiez votre réseau.'); }
    let d = {};
    try { d = await r.json(); } catch (e) { /* réponse vide */ }
    if (!r.ok) {
      if (r.status === 401 && /jwt/i.test(JSON.stringify(d))) {
        throw new Error('La fonction student-access refuse la requête : désactivez « Verify JWT » (voir DEPLOIEMENT.md, étape 3).');
      }
      if (r.status === 404) throw new Error('La fonction student-access est introuvable : déployez-la (voir DEPLOIEMENT.md, étape 3).');
      throw new Error(d.error || 'Service temporairement indisponible.');
    }
    return d;
  };

  St.unlock = async (code, name, silent) => {
    const d = await CP.studentCall({ code: CP.normCode(code) });
    S.student = { code: CP.normCode(code), name: name, className: d.className || 'Ma classe', documents: d.documents || [], lessons: d.lessons || [] };
    try {
      sessionStorage.setItem(SKEY, JSON.stringify({ code: S.student.code, name }));
      localStorage.setItem('cartable.studentName', name);
    } catch (e) { /* ignoré */ }
    if (!silent) CP.toast('Bienvenue, ' + name + '.');
  };
  St.reload = async () => {
    const d = await CP.studentCall({ code: S.student.code });
    S.student.documents = d.documents || [];
    S.student.lessons = d.lessons || [];
    S.student.className = d.className || S.student.className;
  };
  St.quit = () => {
    S.student = null;
    try { sessionStorage.removeItem(SKEY); } catch (e) { /* ignoré */ }
  };
  St.savedName = () => { try { return localStorage.getItem('cartable.studentName') || ''; } catch (e) { return ''; } };

  /* ---------- Fenêtre « Documents » ---------- */
  const KINDS = [['Tous', 'Tous'], ['Cours', 'Cours'], ['Devoir', 'Devoirs'], ['Exercice', 'Exercices'], ['Ressource', 'Ressources']];
  const KIND_COLOR = { Cours: '#4b3fd1', Devoir: '#e0701a', Exercice: '#8a3fd1', Ressource: '#5f6b8a' };
  const isNew = (iso) => Date.now() - new Date(iso).getTime() < 7 * 864e5;

  function docsHtml(win) {
    const st = win.state, q = (st.q || '').toLowerCase();
    const list = S.student.documents.filter((d) =>
      (!st.kind || st.kind === 'Tous' || d.kind === st.kind) &&
      (d.title + ' ' + (d.body || '')).toLowerCase().includes(q));
    if (!list.length) return '<p class="empty">Aucun document ne correspond.</p>';
    return list.map((d) => {
      const u = CP.safeUrl(d.url), long = (d.body || '').length > 320;
      const body = d.body ? (long ? '<details><summary>Afficher le texte</summary><div class="pre">' + CP.linkify(d.body) + '</div></details>' : '<div class="pre">' + CP.linkify(d.body) + '</div>') : '';
      return '<article class="item"><div class="item-head"><b>' + esc(d.title) + '</b><span class="badge" style="--tab:' + (KIND_COLOR[d.kind] || '#2f4fd1') + '">' + esc(d.kind) + '</span>' +
        (isNew(d.created_at) ? '<span class="badge ok">Nouveau</span>' : '') +
        (d.due_date ? '<span class="badge warn">À rendre le ' + esc(CP.fmtDate(d.due_date)) + '</span>' : '') + '</div>' +
        '<div class="muted">Publié le ' + esc(CP.fmtDate(d.created_at)) + '</div>' + body +
        (u ? '<p style="margin-top:8px"><a class="btn btn-sm" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">Ouvrir ↗</a></p>' : '') + '</article>';
    }).join('');
  }

  def('sdocs', {
    label: 'Documents', icon: '📂', color: '#4b3fd1', desc: 'Cours, devoirs, exercices et ressources', w: 720, h: 640,
    render(win) {
      const st = win.state;
      st.kind = st.kind || 'Tous';
      win.body.innerHTML =
        '<div class="row np" style="margin-bottom:10px"><input class="grow" type="search" data-input="q" placeholder="Rechercher un document" aria-label="Rechercher un document" value="' + esc(st.q || '') + '">' +
        '<button type="button" class="btn" data-act="reload">Actualiser</button><button type="button" class="btn" data-act="save">Enregistrer la liste</button></div>' +
        '<div class="chips np" role="group" aria-label="Type de document">' + KINDS.map((k) => '<button type="button" class="chip" data-act="kind" data-k="' + k[0] + '" aria-pressed="' + (st.kind === k[0]) + '">' + k[1] + '</button>').join('') + '</div>' +
        '<div id="dlist">' + docsHtml(win) + '</div>';
    },
    input: { q(win, el) { win.state.q = el.value; $('#dlist', win.body).innerHTML = docsHtml(win); } },
    click: {
      kind(win, el) { win.state.kind = el.dataset.k; return win.cmd.render(win); },
      async reload(win) { await St.reload(); await win.cmd.render(win); CP.app.refreshStudentDesk(); CP.toast('Liste actualisée.'); },
      save() {
        const t = '# ' + S.student.className + '\n\n' + S.student.documents.map((d) =>
          '## ' + d.title + ' (' + d.kind + ')\n' + (d.due_date ? 'À rendre le ' + CP.fmtDate(d.due_date) + '\n' : '') + (d.url || '') + '\n\n' + (d.body || '') + '\n').join('\n');
        CP.download('documents-' + S.student.className.replace(/[^\w-]+/g, '_') + '.md', t, 'text/markdown');
      }
    }
  });

  /* ---------- Fenêtre « Cahier de texte » ---------- */
  def('slessons', {
    label: 'Cahier de texte', icon: '📓', color: '#2e8b57', desc: 'Ce qui a été fait en classe et le travail à faire', w: 660, h: 600,
    render(win) {
      const l = S.student.lessons;
      win.body.innerHTML = l.length
        ? l.map((r) =>
            '<article class="item"><div class="item-head"><b>' + esc(CP.fmtDate(r.lesson_date)) + ' — ' + esc(r.title) + '</b></div>' +
            (r.content ? '<div class="pre">' + esc(r.content) + '</div>' : '') +
            (r.homework ? '<div class="hw"><b>À faire :</b> ' + esc(r.homework) + '</div>' : '') + '</article>').join('')
        : '<p class="empty">Le cahier de texte est vide pour le moment.</p>';
    }
  });

  /* ---------- Fenêtres « Question » et « Rendre un travail » ---------- */
  async function send(win, f, payload, okMsg) {
    const btn = $('button:not([type="button"])', f);
    if (btn) btn.disabled = true;
    try {
      await CP.studentCall(Object.assign({ code: S.student.code, student_name: S.student.name }, payload));
      f.reset();
      CP.toast(okMsg);
    } finally { if (btn) btn.disabled = false; }
  }
  def('squestion', {
    label: 'Poser une question', icon: '💬', color: '#c2417e', desc: 'Écrire au professeur', single: true, w: 540, h: 420,
    render(win) {
      win.body.innerHTML =
        '<form class="card" data-submit="send"><h3>Votre question</h3><p class="muted">Elle sera transmise à votre professeur avec votre nom : <b>' + esc(S.student.name) + '</b>.</p>' +
        '<label class="field">Question<textarea name="q" rows="6" required maxlength="4000"></textarea></label><button class="btn btn-primary">Envoyer la question</button></form>';
    },
    submit: { send(win, f) { return send(win, f, { action: 'question', question: f.elements.q.value.trim() }, 'Question envoyée au professeur.'); } }
  });
  def('ssubmit', {
    label: 'Rendre un travail', icon: '📤', color: '#0e7490', desc: 'Envoyer une réponse ou un lien de fichier', single: true, w: 560, h: 520,
    render(win) {
      win.body.innerHTML =
        '<form class="card" data-submit="send"><h3>Votre travail</h3><p class="muted">Envoyé sous le nom : <b>' + esc(S.student.name) + '</b>.</p>' +
        '<label class="field">Titre de l’exercice<input name="t" required maxlength="200" placeholder="Ex. Exercice 2"></label>' +
        '<label class="field">Réponse ou lien de partage du fichier<textarea name="a" rows="7" required maxlength="12000" placeholder="Écrivez votre réponse ou collez le lien de votre fichier (Drive, OneDrive…)"></textarea></label>' +
        '<button class="btn btn-primary">Envoyer mon travail</button></form>';
    },
    submit: { send(win, f) { return send(win, f, { action: 'submission', title: f.elements.t.value.trim(), answer: f.elements.a.value.trim() }, 'Travail envoyé au professeur.'); } }
  });

  /* ---------- Bureau de l'élève ---------- */
  St.groups = [{ title: 'Ma classe', ids: ['sdocs', 'slessons'] }, { title: 'Écrire au professeur', ids: ['squestion', 'ssubmit'] }];
  St.deskHtml = () => {
    const s = S.student;
    const hw = s.documents.filter((d) => d.kind === 'Devoir' && d.due_date && d.due_date >= CP.today()).sort((a, b) => a.due_date.localeCompare(b.due_date));
    return '<div class="launcher"><section class="hello"><h1>' + esc(s.className) + '</h1><span class="date muted">Bonjour ' + esc(s.name) + ' · ' + esc(CP.longDate()) + '</span>' +
      '<div class="summary" id="ssummary"><ul><li><button type="button" class="link" data-open="sdocs">' + CP.pl(s.documents.length, 'document', 'documents') + '</button></li>' +
      '<li><button type="button" class="link" data-open="slessons">' + CP.pl(s.lessons.length, 'séance au cahier de texte', 'séances au cahier de texte') + '</button></li></ul>' +
      (hw.length ? '<p class="muted" style="margin-top:4px">Prochain devoir : <b>' + esc(hw[0].title) + '</b>, à rendre le ' + esc(CP.fmtDate(hw[0].due_date)) + '.</p>' : '') + '</div></section>' +
      St.groups.map((g) => '<section class="group"><h2>' + esc(g.title) + '</h2><div class="tiles">' + g.ids.map((id) => CP.tile(cmds[id])).join('') + '</div></section>').join('') +
      '<p class="hint">Chaque outil s’ouvre dans sa propre fenêtre : vous pouvez garder la liste des documents ouverte pendant que vous rédigez votre réponse.</p></div>';
  };
})();
