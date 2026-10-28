/* Cartable — espace professeur : chaque commande est une fenêtre indépendante. */
(function () {
  'use strict';
  const CP = window.CP, $ = CP.$, $$ = CP.$$, esc = CP.esc, S = CP.state, must = CP.must;
  const cmds = (CP.commands = CP.commands || {});
  const T = (CP.teacher = {});
  const db = () => CP.db;

  const def = (id, o) => {
    o.id = id;
    ['click', 'submit', 'change', 'input'].forEach((k) => (o[k] = o[k] || {}));
    cmds[id] = o;
    return o;
  };
  const touch = (win, tables) => CP.wm.refresh(tables, win);
  const confirmDel = (msg) => CP.confirm(msg, { ok: 'Supprimer', danger: true, title: 'Supprimer ?' });
  const STATUS = { P: 'Présent', A: 'Absent', R: 'Retard' };
  const SEP = ' — ';
  /** Nettoie une liste de noms : numérotation retirée, espaces normalisés, doublons ignorés. */
  const cleanNames = (lines, have) => {
    const seen = new Set(have || []), out = [];
    lines.map((n) => n.replace(/^\s*\d+\s*[.)-]\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean).forEach((n) => {
      if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push(n); }
    });
    return out;
  };

  /* ======================================================================
     Classes (état global)
     ====================================================================== */
  CP.loadClasses = async () => {
    const data = await must(db().from('classes').select('id,name,level,created_at').order('created_at', { ascending: false }));
    S.classes = data || [];
    if (!S.classes.some((c) => c.id === S.activeClassId)) CP.setActive(S.classes[0] ? S.classes[0].id : null, true);
    CP.wm.syncClasses();
    CP.app.renderHeader();
  };
  CP.setActive = (id, silent) => {
    S.activeClassId = id || null;
    try { localStorage.setItem('cartable.active', id || ''); } catch (e) { /* ignoré */ }
    if (!silent) { CP.app.renderHeader(); T.loadSummary(); }
  };

  /* ======================================================================
     Fenêtre « Classes »
     ====================================================================== */
  def('classes', {
    label: 'Classes', icon: '👥', color: '#2f4fd1', desc: 'Créer les classes et leurs codes d’accès', w: 780, h: 620,
    async render(win) {
      await CP.loadClasses();
      let counts = {};
      try {
        (await CP.fetchAll('students', 'class_id')).forEach((r) => { counts[r.class_id] = (counts[r.class_id] || 0) + 1; });
      } catch (e) { counts = null; }
      const groups = {};
      S.classes.forEach((c) => (groups[c.level] = groups[c.level] || []).push(c));
      const order = Object.keys(groups).sort((a, b) => CP.levelRank(a) - CP.levelRank(b) || a.localeCompare(b, 'fr'));
      const list = order.map((l) =>
        '<h3 class="grp">' + esc(l) + '</h3>' +
        groups[l].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })).map((c) =>
          '<article class="item"><div class="item-head"><b>' + esc(c.name) + '</b>' +
          (counts ? '<span class="muted">' + CP.pl(counts[c.id] || 0, 'élève', 'élèves') + '</span>' : '') +
          (c.id === S.activeClassId ? '<span class="badge ok">Classe active</span>' : '') + '</div>' +
          '<div class="item-actions np">' +
          (c.id === S.activeClassId ? '' : '<button type="button" class="btn btn-sm" data-act="activate" data-id="' + c.id + '">Choisir comme classe active</button>') +
          '<button type="button" class="btn btn-sm" data-act="regen" data-id="' + c.id + '">Nouveau code</button>' +
          '<button type="button" class="btn btn-sm" data-act="rename" data-id="' + c.id + '">Renommer</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-act="del" data-id="' + c.id + '">Supprimer</button></div></article>'
        ).join('')
      ).join('');
      win.body.innerHTML =
        '<form class="card np" data-submit="create"><h3>Nouvelle classe</h3><div class="grid2">' +
        '<label class="field">Nom de la classe<input name="name" required maxlength="120" placeholder="Ex. 1ère année 4"></label>' +
        '<label class="field">Niveau<select name="level">' + CP.LEVELS.map((l) => '<option>' + esc(l) + '</option>').join('') + '</select></label></div>' +
        '<label class="field">Liste des élèves <span class="hint-text">(facultatif — un nom par ligne ; copiez-collez depuis Word ou Excel)</span><textarea name="students" rows="6" placeholder="Ben Ali Sami&#10;Trabelsi Lina&#10;…"></textarea></label>' +
        '<button class="btn btn-primary">Créer la classe et ses élèves</button>' +
        '<p class="muted" style="margin-top:10px">Un code d’accès est généré automatiquement. Il n’est affiché qu’une seule fois ; vous pourrez toujours en créer un nouveau.</p></form>' +
        '<div class="card np"><h3>Page à donner aux élèves</h3><div class="row"><input class="grow mono" readonly aria-label="Lien de la page des élèves" value="' + esc(CP.studentLink()) + '">' +
        '<button type="button" class="btn" data-act="copylink">Copier le lien</button></div></div>' +
        (list || '<p class="empty">Aucune classe pour le moment. Créez la première ci-dessus.</p>');
    },
    submit: {
      async create(win, f) {
        const name = f.elements.name.value.trim(), level = f.elements.level.value;
        if (!name) return CP.toast('Indiquez le nom de la classe.', 'err');
        const code = CP.makeCode();
        const names = cleanNames(f.elements.students.value.split(/\r?\n/)).slice(0, 300);
        // Une seule opération côté base : la classe et sa liste d'élèves sont créées ensemble.
        const id = await must(db().rpc('create_class', { p_name: name, p_level: level, p_code_hash: await CP.hashCode(code), p_students: names }));
        CP.setActive(id, true);
        await win.cmd.render(win);
        touch(win, ['classes', 'students']);
        CP.toast(names.length ? 'Classe créée avec ' + CP.pl(names.length, 'élève.', 'élèves.') : 'Classe créée.');
        await CP.showCode(name, code);
        T.loadSummary();
      }
    },
    click: {
      copylink() { return CP.copy(CP.studentLink()); },
      async activate(win, el) { CP.setActive(el.dataset.id); CP.wm.syncClasses(); await win.cmd.render(win); },
      async regen(win, el) {
        const c = S.classes.find((x) => x.id === el.dataset.id);
        if (!c || !(await CP.confirm('L’ancien code de « ' + c.name + ' » cessera de fonctionner. Les élèves devront utiliser le nouveau code.', { ok: 'Créer un nouveau code', title: 'Nouveau code ?' }))) return;
        const code = CP.makeCode();
        await must(db().from('classes').update({ code_hash: await CP.hashCode(code) }).eq('id', c.id));
        await CP.showCode(c.name, code);
      },
      async rename(win, el) {
        const c = S.classes.find((x) => x.id === el.dataset.id);
        const name = c && (await CP.promptText('Renommer la classe', 'Nouveau nom', c.name));
        if (!name) return;
        await must(db().from('classes').update({ name }).eq('id', c.id));
        await win.cmd.render(win);
        touch(win, ['classes']);
      },
      async del(win, el) {
        const c = S.classes.find((x) => x.id === el.dataset.id);
        if (!c || !(await confirmDel('Supprimer la classe « ' + c.name + ' » ? Ses élèves, appels, notes, séances, documents et messages seront aussi supprimés. Cette action est définitive.'))) return;
        await must(db().from('classes').delete().eq('id', c.id));
        await win.cmd.render(win);
        touch(win, ['classes', 'students']);
        T.loadSummary();
        CP.toast('Classe supprimée.');
      }
    }
  });

  /* ======================================================================
     Fenêtre « Élèves »
     ====================================================================== */
  def('students', {
    label: 'Élèves', icon: '🧑‍🎓', color: '#0f8b8d', desc: 'Liste des élèves de la classe', needsClass: true, tables: ['classes'], w: 560, h: 600,
    async render(win) {
      const rows = await must(db().from('students').select('id,full_name').eq('class_id', win.state.classId).order('full_name'));
      win.rows = rows || [];
      win.body.innerHTML =
        '<p><b>' + CP.pl(win.rows.length, 'élève', 'élèves') + '</b></p>' +
        '<form class="card np" data-submit="add"><h3>Ajouter un élève</h3><div class="row"><input class="grow" name="n" required maxlength="120" placeholder="Nom et prénom" aria-label="Nom et prénom">' +
        '<button class="btn btn-primary">Ajouter</button></div></form>' +
        '<form class="card np" data-submit="bulk"><details><summary>Ajouter toute une liste</summary>' +
        '<label class="field" style="margin-top:10px">Un élève par ligne (copiez-collez depuis Word ou Excel)<textarea name="list" rows="6"></textarea></label>' +
        '<button class="btn">Ajouter la liste</button></details></form>' +
        (win.rows.length
          ? '<ul class="plain">' + win.rows.map((r) => '<li><span>' + esc(r.full_name) + '</span><button type="button" class="btn btn-sm btn-danger np" data-act="del" data-id="' + r.id + '" aria-label="Retirer ' + esc(r.full_name) + '">Retirer</button></li>').join('') + '</ul>'
          : '<p class="empty">Aucun élève. Ajoutez-en un ou collez la liste de la classe.</p>');
    },
    submit: {
      async add(win, f) { await win.cmd.addNames(win, [f.elements.n.value]); },
      async bulk(win, f) { await win.cmd.addNames(win, f.elements.list.value.split(/\r?\n/)); }
    },
    async addNames(win, names) {
      const fresh = cleanNames(names, win.rows.map((r) => r.full_name.toLowerCase())).slice(0, 300);
      if (!fresh.length) return CP.toast('Aucun nouvel élève à ajouter.', 'err');
      await must(db().from('students').insert(fresh.map((full_name) => ({ class_id: win.state.classId, full_name }))));
      await win.cmd.render(win);
      touch(win, ['students']);
      CP.toast(CP.pl(fresh.length, 'élève ajouté.', 'élèves ajoutés.'));
    },
    click: {
      async del(win, el) {
        await must(db().from('students').delete().eq('id', el.dataset.id));
        await win.cmd.render(win);
        touch(win, ['students']);
        CP.toast('Élève retiré de la liste.');
      }
    }
  });

  /* ======================================================================
     Fenêtre « Appel » : saisie d'une séance + journal en tableau (historique)
     ====================================================================== */
  function parseEntries(text) { // anciens appels enregistrés sous forme de texte
    const m = {};
    String(text || '').split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const i = line.lastIndexOf('—');
      if (i <= 0) return;
      const k = (line.slice(i + 1).trim()[0] || '').toUpperCase();
      if (k === 'P' || k === 'A' || k === 'R') m[line.slice(0, i).trim().toLowerCase()] = k;
    });
    return m;
  }
  const sessionTitle = (s) => CP.fmtDate(s.attendance_date) + (s.session_label ? ' · ' + s.session_label : '');
  function attSummary(win) {
    const v = win.students.map((s) => win.marks[s.id]).filter(Boolean);
    const n = (k) => v.filter((x) => x === k).length, left = win.students.length - v.length;
    return CP.pl(n('P'), 'présent', 'présents') + ' · ' + CP.pl(n('A'), 'absent', 'absents') + ' · ' + CP.pl(n('R'), 'retard', 'retards') + (left ? ' · ' + left + ' à pointer' : '');
  }
  function paintAtt(win) {
    $$('tr[data-id]', win.body).forEach((tr) => {
      const v = win.marks[tr.dataset.id];
      $$('.seg button', tr).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    });
    const s = $('#att-sum', win.body);
    if (s) s.textContent = attSummary(win);
  }
  /** Construit la grille élève × séance (statuts lus en base, ou dans l'ancien texte si besoin). */
  function buildGrid(win, marks) {
    const byName = {};
    win.students.forEach((s) => (byName[s.full_name.toLowerCase()] = s.id));
    const grid = {};
    win.sessions.forEach((x) => (grid[x.id] = {}));
    marks.forEach((m) => { if (grid[m.attendance_id]) grid[m.attendance_id][m.student_id] = m.status; });
    win.sessions.forEach((x) => {
      if (Object.keys(grid[x.id]).length) return;
      const legacy = parseEntries(x.entries);
      Object.keys(legacy).forEach((n) => { if (byName[n]) grid[x.id][byName[n]] = legacy[n]; });
    });
    return grid;
  }

  def('attendance', {
    label: 'Appel', icon: '📋', color: '#d6455d', desc: 'Pointer chaque séance et consulter l’historique', needsClass: true, tables: ['students'], w: 920, h: 700,
    async render(win) {
      const st = win.state;
      st.date = st.date || CP.today();
      st.label = st.label || '';
      const [students, sessions] = await Promise.all([
        must(db().from('students').select('id,full_name').eq('class_id', st.classId).order('full_name')),
        must(db().from('attendance').select('id,attendance_date,session_label,entries,created_at').eq('class_id', st.classId)
          .order('attendance_date', { ascending: false }).order('created_at', { ascending: false }).limit(40)]);
      win.students = students || [];
      win.sessions = sessions || [];
      const ids = win.sessions.map((x) => x.id);
      const marks = ids.length ? (await must(db().from('attendance_marks').select('attendance_id,student_id,status').in('attendance_id', ids))) || [] : [];
      win.grid = buildGrid(win, marks);

      const cur = win.sessions.find((x) => x.attendance_date === st.date && (x.session_label || '') === st.label) || null;
      st.recId = cur ? cur.id : null;
      win.marks = cur ? Object.assign({}, win.grid[cur.id]) : {};

      /* Saisie de la séance */
      const entryRows = win.students.map((s) =>
        '<tr data-id="' + s.id + '"><td>' + esc(s.full_name) + '</td><td><div class="seg" role="group" aria-label="Statut de ' + esc(s.full_name) + '">' +
        ['P', 'A', 'R'].map((k) => '<button type="button" class="s-' + k + '" data-act="mark" data-v="' + k + '" aria-pressed="false" title="' + STATUS[k] + '">' + k + '</button>').join('') +
        '</div></td></tr>').join('');
      const entry =
        '<section class="card np"><h3>' + (cur ? 'Modifier l’appel du ' + esc(sessionTitle(cur)) : 'Nouvel appel') + '</h3>' +
        '<div class="row" style="margin-bottom:10px"><label class="field" style="margin:0">Date<input type="date" data-change="date" value="' + esc(st.date) + '"></label>' +
        '<label class="field" style="margin:0">Séance <span class="hint-text">(facultatif)</span><input data-change="label" maxlength="60" placeholder="Ex. Séance 2" value="' + esc(st.label) + '"></label>' +
        '<button type="button" class="btn" data-act="allP">Tous présents</button><button type="button" class="btn" data-act="clear">Effacer</button></div>' +
        (win.students.length
          ? '<p class="muted">Touchez P (présent), A (absent) ou R (retard). Un second appui annule le choix.</p>' +
            '<div class="tablewrap"><table class="tbl"><thead><tr><th>Élève</th><th>Statut</th></tr></thead><tbody>' + entryRows + '</tbody></table></div>' +
            '<div class="row"><button type="button" class="btn btn-primary" data-act="save">Enregistrer l’appel</button>' +
            (cur ? '<button type="button" class="btn btn-danger" data-act="delrec" data-id="' + cur.id + '">Supprimer cet appel</button>' : '') +
            '<span class="muted" id="att-sum"></span></div>'
          : '<div class="empty"><p>Aucun élève dans cette classe.</p><button type="button" class="btn btn-primary" data-act="openStudents">Ajouter les élèves</button></div>') +
        '</section>';

      /* Journal : tableau élèves × séances */
      let journal = '<p class="empty">Aucun appel enregistré pour cette classe.</p>';
      if (win.sessions.length && win.students.length) {
        const tot = {};
        win.students.forEach((s) => {
          let a = 0, r = 0;
          win.sessions.forEach((x) => { const v = win.grid[x.id][s.id]; if (v === 'A') a++; if (v === 'R') r++; });
          tot[s.id] = { a, r };
        });
        const head = win.sessions.map((x) =>
          '<th class="' + (x.id === st.recId ? 'cur' : '') + '"><button type="button" class="hbtn" data-act="view" data-date="' + esc(x.attendance_date) + '" data-label="' + esc(x.session_label || '') +
          '" title="Ouvrir cet appel">' + esc(CP.fmtDate(x.attendance_date).slice(0, 5)) + '<small>' + esc(x.session_label || String(x.attendance_date).slice(0, 4)) + '</small></button></th>').join('');
        const body = win.students.map((s) =>
          '<tr><td>' + esc(s.full_name) + '</td><td>' + tot[s.id].a + '</td><td>' + tot[s.id].r + '</td>' +
          win.sessions.map((x) => { const v = win.grid[x.id][s.id]; return '<td class="cell-' + (v || '0') + '" title="' + esc(v ? STATUS[v] : 'Non pointé') + '">' + (v || '·') + '</td>'; }).join('') + '</tr>').join('');
        const foot = ['P', 'A', 'R'].map((k) =>
          '<tr><td>' + STATUS[k] + 's</td><td></td><td></td>' + win.sessions.map((x) => '<td>' + win.students.filter((s) => win.grid[x.id][s.id] === k).length + '</td>').join('') + '</tr>').join('');
        journal =
          '<div class="row np" style="margin-bottom:8px"><span class="muted grow">Séances les plus récentes à gauche. Cliquez sur une date pour rouvrir l’appel.</span>' +
          '<button type="button" class="btn btn-sm" data-act="csv">Exporter (Excel)</button></div>' +
          '<div class="tablewrap"><table class="matrix"><thead><tr><th>Élève</th><th title="Absences">Abs.</th><th title="Retards">Ret.</th>' + head + '</tr></thead>' +
          '<tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>';
      }

      let appLink = '';
      try { appLink = localStorage.getItem('cartable.appLink') || ''; } catch (e) { /* ignoré */ }
      win.body.innerHTML = entry + '<section><h3 class="grp" style="margin-top:4px">Journal d’appel — historique des séances</h3>' + journal + '</section>' +
        '<details class="card np" style="margin-top:14px"><summary>Mon application d’appel (lien externe)</summary>' +
        '<p class="muted" style="margin-top:8px">Un fichier .exe ne peut pas s’ouvrir depuis une page web. Collez ici le lien de votre application (version web ou dossier Drive).</p>' +
        '<div class="row"><input class="grow" data-change="applink" placeholder="https://…" value="' + esc(appLink) + '" aria-label="Lien de mon application d’appel">' +
        (CP.safeUrl(appLink) ? '<a class="btn" target="_blank" rel="noopener noreferrer" href="' + esc(CP.safeUrl(appLink)) + '">Ouvrir ↗</a>' : '') + '</div></details>';
      paintAtt(win);
    },
    change: {
      date(win, el) { win.state.date = el.value || CP.today(); win.state.label = ''; return win.cmd.render(win); },
      label(win, el) { win.state.label = el.value.trim(); return win.cmd.render(win); },
      applink(win, el) {
        const u = el.value.trim() ? CP.safeUrl(el.value) : '';
        try { localStorage.setItem('cartable.appLink', u); } catch (e) { /* ignoré */ }
        return win.cmd.render(win);
      }
    },
    click: {
      mark(win, el) {
        const id = el.closest('tr').dataset.id, v = el.dataset.v;
        if (win.marks[id] === v) delete win.marks[id]; else win.marks[id] = v;
        paintAtt(win);
      },
      allP(win) { win.marks = {}; win.students.forEach((s) => (win.marks[s.id] = 'P')); paintAtt(win); },
      clear(win) { win.marks = {}; paintAtt(win); },
      openStudents(win) { CP.wm.open(cmds.students, { classId: win.state.classId }); },
      view(win, el) {
        win.state.date = el.dataset.date; win.state.label = el.dataset.label || '';
        return win.cmd.render(win).then(() => win.body.scrollTo({ top: 0 }));
      },
      async delrec(win, el) {
        if (!(await confirmDel('Supprimer cet appel et les statuts de tous les élèves pour cette séance ?'))) return;
        await must(db().from('attendance').delete().eq('id', el.dataset.id));
        await win.cmd.render(win);
        CP.toast('Appel supprimé.');
      },
      async save(win) {
        const marks = win.students.filter((s) => win.marks[s.id]).map((s) => ({ student_id: s.id, status: win.marks[s.id] }));
        if (!marks.length) return CP.toast('Pointez au moins un élève avant d’enregistrer.', 'err');
        await must(db().rpc('save_attendance', { p_class_id: win.state.classId, p_date: win.state.date, p_label: win.state.label || '', p_marks: marks }));
        await win.cmd.render(win);
        CP.toast('Appel enregistré.');
      },
      csv(win) {
        const head = ['Élève', 'Absences', 'Retards'].concat(win.sessions.map(sessionTitle));
        const rows = win.students.map((s) => {
          const v = win.sessions.map((x) => win.grid[x.id][s.id] || '');
          return [s.full_name, v.filter((k) => k === 'A').length, v.filter((k) => k === 'R').length].concat(v.map((k) => (k ? STATUS[k] : '')));
        });
        CP.download('journal-appel-' + CP.today() + '.csv', CP.csv([head].concat(rows)), 'text/csv');
      }
    }
  });

  /* ======================================================================
     Fenêtre « Cahier de texte »
     ====================================================================== */
  def('journal', {
    label: 'Cahier de texte', icon: '📓', color: '#2e8b57', desc: 'Séances et travail à faire', needsClass: true, w: 720, h: 660,
    async render(win) {
      const rows = (await must(db().from('lessons').select('*').eq('class_id', win.state.classId)
        .order('lesson_date', { ascending: false }).order('created_at', { ascending: false }).limit(100))) || [];
      win.rows = rows;
      const ed = rows.find((r) => r.id === win.state.editId) || null;
      win.body.innerHTML =
        '<form class="card np" data-submit="save"><h3>' + (ed ? 'Modifier la séance' : 'Nouvelle séance') + '</h3>' +
        '<div class="grid2"><label class="field">Date<input type="date" name="date" required value="' + esc(ed ? ed.lesson_date : CP.today()) + '"></label>' +
        '<label class="field">Titre ou thème<input name="title" required maxlength="200" value="' + esc(ed ? ed.title : '') + '" placeholder="Ex. Le tableur : les formules"></label></div>' +
        '<label class="field">Contenu réalisé<textarea name="content" rows="4">' + esc(ed ? ed.content : '') + '</textarea></label>' +
        '<label class="field">Travail à faire<textarea name="homework" rows="2">' + esc(ed ? ed.homework : '') + '</textarea></label>' +
        '<div class="row"><button class="btn btn-primary">Enregistrer la séance</button>' + (ed ? '<button type="button" class="btn" data-act="cancel">Annuler</button>' : '') + '</div></form>' +
        (rows.length
          ? rows.map((r) =>
              '<article class="item"><div class="item-head"><b>' + esc(CP.fmtDate(r.lesson_date)) + ' — ' + esc(r.title) + '</b></div>' +
              (r.content ? '<div class="pre">' + esc(r.content) + '</div>' : '') +
              (r.homework ? '<div class="hw"><b>À faire :</b> ' + esc(r.homework) + '</div>' : '') +
              '<div class="item-actions np"><button type="button" class="btn btn-sm" data-act="edit" data-id="' + r.id + '">Modifier</button>' +
              '<button type="button" class="btn btn-sm btn-danger" data-act="del" data-id="' + r.id + '">Supprimer</button></div></article>').join('')
          : '<p class="empty">Aucune séance enregistrée.</p>');
    },
    submit: {
      async save(win, f) {
        const row = { lesson_date: f.elements.date.value, title: f.elements.title.value.trim(), content: f.elements.content.value.trim(), homework: f.elements.homework.value.trim() };
        if (!row.title) return CP.toast('Indiquez le titre de la séance.', 'err');
        if (win.state.editId) await must(db().from('lessons').update(row).eq('id', win.state.editId));
        else await must(db().from('lessons').insert(Object.assign({ class_id: win.state.classId }, row)));
        win.state.editId = null;
        await win.cmd.render(win);
        CP.toast('Séance enregistrée.');
      }
    },
    click: {
      edit(win, el) { win.state.editId = el.dataset.id; return win.cmd.render(win).then(() => win.body.scrollTo({ top: 0 })); },
      cancel(win) { win.state.editId = null; return win.cmd.render(win); },
      async del(win, el) {
        if (!(await confirmDel('Supprimer cette séance ?'))) return;
        await must(db().from('lessons').delete().eq('id', el.dataset.id));
        win.state.editId = null;
        await win.cmd.render(win);
      }
    }
  });

  /* ======================================================================
     Fenêtres « Cours », « Devoirs », « Exercices », « Ressources »
     ====================================================================== */
  function material(id, o) {
    return def(id, Object.assign({
      needsClass: true, w: 740, h: 680,
      async render(win) {
        const rows = (await must(db().from('materials').select('*').eq('class_id', win.state.classId).eq('kind', this.kind).order('created_at', { ascending: false }))) || [];
        win.rows = rows;
        const ed = rows.find((r) => r.id === win.state.editId) || null;
        win.body.innerHTML =
          '<form class="card np" data-submit="save"><h3>' + (ed ? 'Modifier' : this.addTitle) + '</h3>' +
          '<label class="field">Titre<input name="title" required maxlength="200" value="' + esc(ed ? ed.title : '') + '" placeholder="' + esc(this.placeholder) + '"></label>' +
          '<label class="field">' + esc(this.bodyLabel) + '<textarea name="body" rows="4">' + esc(ed ? ed.body : '') + '</textarea></label>' +
          '<div class="grid2"><label class="field">Lien (Drive, YouTube, site…)<input name="url" inputmode="url" placeholder="https://…" value="' + esc(ed && ed.url ? ed.url : '') + '"></label>' +
          (this.hasDue ? '<label class="field">À rendre pour le<input type="date" name="due" value="' + esc(ed && ed.due_date ? ed.due_date : '') + '"></label>' : '') + '</div>' +
          '<label class="check"><input type="checkbox" name="published"' + (!ed || ed.published ? ' checked' : '') + '> Visible par les élèves</label>' +
          '<div class="row"><button class="btn btn-primary">Enregistrer</button>' + (ed ? '<button type="button" class="btn" data-act="cancel">Annuler</button>' : '') +
          '<button type="button" class="btn" data-act="drive">Ajouter depuis Google Drive</button></div></form>' +
          (rows.length
            ? rows.map((r) =>
                '<article class="item"><div class="item-head"><b>' + esc(r.title) + '</b>' +
                (r.published ? '<span class="badge ok">Visible</span>' : '<span class="badge mute">Brouillon</span>') +
                (r.due_date ? '<span class="badge warn">À rendre le ' + esc(CP.fmtDate(r.due_date)) + '</span>' : '') + '</div>' +
                (r.body ? '<div class="pre">' + CP.linkify(r.body) + '</div>' : '') +
                (CP.safeUrl(r.url) ? '<p><a href="' + esc(CP.safeUrl(r.url)) + '" target="_blank" rel="noopener noreferrer">Ouvrir le lien ↗</a></p>' : '') +
                '<div class="item-actions np"><button type="button" class="btn btn-sm" data-act="toggle" data-id="' + r.id + '">' + (r.published ? 'Passer en brouillon' : 'Rendre visible') + '</button>' +
                '<button type="button" class="btn btn-sm" data-act="edit" data-id="' + r.id + '">Modifier</button>' +
                '<button type="button" class="btn btn-sm btn-danger" data-act="del" data-id="' + r.id + '">Supprimer</button></div></article>').join('')
            : '<p class="empty">' + esc(this.emptyText) + '</p>');
      },
      submit: {
        async save(win, f) {
          const cmd = win.cmd;
          const raw = f.elements.url.value.trim(), url = raw ? CP.safeUrl(raw) : null;
          if (raw && !url) return CP.toast('Ce lien n’est pas valide.', 'err');
          const row = { title: f.elements.title.value.trim(), body: f.elements.body.value.trim(), url, published: f.elements.published.checked };
          if (!row.title) return CP.toast('Indiquez un titre.', 'err');
          if (cmd.hasDue) row.due_date = f.elements.due.value || null;
          if (win.state.editId) await must(db().from('materials').update(row).eq('id', win.state.editId));
          else await must(db().from('materials').insert(Object.assign({ class_id: win.state.classId, kind: cmd.kind }, row)));
          win.state.editId = null;
          await win.cmd.render(win);
          CP.toast('Enregistré.');
        }
      },
      click: {
        edit(win, el) { win.state.editId = el.dataset.id; return win.cmd.render(win).then(() => win.body.scrollTo({ top: 0 })); },
        cancel(win) { win.state.editId = null; return win.cmd.render(win); },
        async toggle(win, el) {
          const r = win.rows.find((x) => x.id === el.dataset.id);
          await must(db().from('materials').update({ published: !r.published }).eq('id', r.id));
          await win.cmd.render(win);
        },
        async del(win, el) {
          if (!(await confirmDel('Supprimer ce document ?'))) return;
          await must(db().from('materials').delete().eq('id', el.dataset.id));
          win.state.editId = null;
          await win.cmd.render(win);
        },
        drive(win) { return CP.drive.pick({ classId: win.state.classId, kind: win.cmd.kind, onDone: () => win.cmd.render(win) }); }
      }
    }, o));
  }
  material('course', { label: 'Cours', icon: '📘', color: '#4b3fd1', desc: 'Leçons et supports de cours', kind: 'Cours', addTitle: 'Nouveau cours', placeholder: 'Ex. Chapitre 2 — Le traitement de texte', bodyLabel: 'Résumé ou contenu', emptyText: 'Aucun cours pour cette classe.' });
  material('homework', { label: 'Devoirs', icon: '✏️', color: '#e0701a', desc: 'Travaux à rendre, avec date limite', kind: 'Devoir', hasDue: true, addTitle: 'Nouveau devoir', placeholder: 'Ex. Devoir maison n°1', bodyLabel: 'Consignes', emptyText: 'Aucun devoir pour cette classe.' });
  material('exercise', { label: 'Exercices', icon: '🧩', color: '#8a3fd1', desc: 'Exercices et activités pratiques', kind: 'Exercice', addTitle: 'Nouvel exercice', placeholder: 'Ex. TP1 — Créer un tableau', bodyLabel: 'Énoncé', emptyText: 'Aucun exercice pour cette classe.' });
  material('resource', { label: 'Ressources', icon: '🔗', color: '#5f6b8a', desc: 'Liens, vidéos et documents utiles', kind: 'Ressource', addTitle: 'Nouvelle ressource', placeholder: 'Ex. Vidéo : fonctionnement d’Internet', bodyLabel: 'Description', emptyText: 'Aucune ressource pour cette classe.' });

  /* ======================================================================
     Fenêtre « Notes »
     ====================================================================== */
  const norm = (r) => (Number(r.score) / Number(r.max_score)) * 20;
  def('grades', {
    label: 'Notes', icon: '📝', color: '#d9a400', desc: 'Évaluations, moyennes et export Excel', needsClass: true, tables: ['students'], w: 780, h: 700,
    async render(win) {
      const cid = win.state.classId;
      const [students, rows] = await Promise.all([
        must(db().from('students').select('full_name').eq('class_id', cid).order('full_name')),
        CP.fetchAll('grades', '*', (q) => q.eq('class_id', cid).order('created_at', { ascending: false }))
      ]);
      win.rows = rows;
      const by = {};
      rows.forEach((r) => (by[r.student_name] = by[r.student_name] || []).push(norm(r)));
      const avgs = Object.keys(by).sort((a, b) => a.localeCompare(b, 'fr')).map((n) => [n, by[n].length, by[n].reduce((x, y) => x + y, 0) / by[n].length]);
      const classAvg = avgs.length ? avgs.reduce((s, a) => s + a[2], 0) / avgs.length : null;
      const last = win.state.last || { assessment: '', max: 20 };
      win.body.innerHTML =
        '<form class="card np" data-submit="save"><h3>Saisir une note</h3>' +
        '<div class="grid2"><label class="field">Élève<input name="student" list="gl-st" required maxlength="120" autocomplete="off"></label>' +
        '<label class="field">Évaluation<input name="assessment" required maxlength="120" value="' + esc(last.assessment) + '" placeholder="Devoir de contrôle n°1"></label>' +
        '<label class="field">Note obtenue<input name="score" type="number" min="0" step="0.25" required inputmode="decimal"></label>' +
        '<label class="field">Sur<input name="max" type="number" min="1" step="0.5" required value="' + esc(last.max) + '"></label></div>' +
        '<label class="field">Appréciation (facultatif)<input name="remark" maxlength="200"></label>' +
        '<datalist id="gl-st">' + (students || []).map((s) => '<option value="' + esc(s.full_name) + '">').join('') + '</datalist>' +
        '<button class="btn btn-primary">Enregistrer la note</button></form>' +
        '<h3 class="grp">Moyennes sur 20</h3>' +
        (avgs.length
          ? '<div class="tablewrap"><table class="tbl"><thead><tr><th>Élève</th><th class="num">Notes</th><th class="num">Moyenne</th></tr></thead><tbody>' +
            avgs.map((a) => '<tr><td>' + esc(a[0]) + '</td><td class="num">' + a[1] + '</td><td class="num"><b>' + CP.fmtNum(a[2]) + '</b></td></tr>').join('') +
            '</tbody><tfoot><tr><td colspan="2"><b>Moyenne de la classe</b></td><td class="num"><b>' + CP.fmtNum(classAvg) + '</b></td></tr></tfoot></table></div>'
          : '<p class="empty">Aucune note pour le moment.</p>') +
        '<h3 class="grp">Toutes les notes</h3>' +
        (rows.length
          ? '<div class="row np" style="margin-bottom:8px"><input class="grow" type="search" data-input="filter" placeholder="Filtrer par nom ou évaluation" aria-label="Filtrer les notes">' +
            '<button type="button" class="btn" data-act="csv">Exporter (Excel)</button></div>' +
            '<div class="tablewrap"><table class="tbl" id="gl"><thead><tr><th>Élève</th><th>Évaluation</th><th class="num">Note</th><th>Appréciation</th><th class="np"></th></tr></thead><tbody>' +
            rows.map((r) => '<tr><td>' + esc(r.student_name) + '</td><td>' + esc(r.assessment) + '</td><td class="num">' + CP.fmtNum(Number(r.score)) + ' / ' + CP.fmtNum(Number(r.max_score)) + '</td><td>' + esc(r.remark || '') +
              '</td><td class="np"><button type="button" class="btn btn-sm btn-danger" data-act="del" data-id="' + r.id + '" aria-label="Supprimer la note de ' + esc(r.student_name) + '">Supprimer</button></td></tr>').join('') +
            '</tbody></table></div>'
          : '');
    },
    submit: {
      async save(win, f) {
        const score = Number(f.elements.score.value), max = Number(f.elements.max.value);
        if (!(score >= 0) || !(max > 0) || score > max) return CP.toast('La note doit être comprise entre 0 et la note maximale.', 'err');
        await must(db().from('grades').insert({
          class_id: win.state.classId, student_name: f.elements.student.value.trim(), assessment: f.elements.assessment.value.trim(),
          score, max_score: max, remark: f.elements.remark.value.trim()
        }));
        win.state.last = { assessment: f.elements.assessment.value.trim(), max };
        await win.cmd.render(win);
        const s = $('input[name="student"]', win.body);
        if (s) s.focus();
        CP.toast('Note enregistrée.');
      }
    },
    input: {
      filter(win, el) {
        const q = el.value.toLowerCase();
        $$('#gl tbody tr', win.body).forEach((tr) => (tr.hidden = !tr.textContent.toLowerCase().includes(q)));
      }
    },
    click: {
      csv(win) {
        const head = ['Élève', 'Évaluation', 'Note', 'Sur', 'Note sur 20', 'Appréciation'];
        CP.download('notes-' + CP.today() + '.csv', CP.csv([head].concat(win.rows.map((r) =>
          [r.student_name, r.assessment, r.score, r.max_score, CP.fmtNum(norm(r)), r.remark || '']))), 'text/csv');
      },
      async del(win, el) {
        if (!(await confirmDel('Supprimer cette note ?'))) return;
        await must(db().from('grades').delete().eq('id', el.dataset.id));
        await win.cmd.render(win);
      }
    }
  });

  /* ======================================================================
     Fenêtres « Questions » et « Travaux rendus »
     ====================================================================== */
  function inbox(id, o) {
    return def(id, {
      needsClass: true, w: 700, h: 580, label: o.label, icon: o.icon, color: o.color, desc: o.desc,
      async render(win) {
        const rows = (await must(db().from(o.table).select('*').eq('class_id', win.state.classId).order('created_at', { ascending: false }).limit(200))) || [];
        win.body.innerHTML =
          '<div class="row np" style="margin-bottom:8px"><b>' + CP.pl(rows.length, o.one, o.many) + '</b><button type="button" class="btn btn-sm" data-act="refresh">Actualiser</button></div>' +
          (rows.length
            ? rows.map((r) =>
                '<article class="item"><div class="item-head"><b>' + esc(r.student_name || 'Élève') + '</b>' + (o.table === 'submissions' ? '<span class="badge">' + esc(r.title) + '</span>' : '') +
                '<span class="muted">' + esc(CP.fmtDateTime(r.created_at)) + '</span></div>' +
                '<div class="pre">' + CP.linkify(r.question || r.answer || '') + '</div>' +
                '<div class="item-actions np"><button type="button" class="btn btn-sm btn-danger" data-act="del" data-id="' + r.id + '">Supprimer</button></div></article>').join('')
            : '<p class="empty">' + esc(o.empty) + '</p>');
      },
      click: {
        refresh(win) { return win.cmd.render(win); },
        async del(win, el) {
          if (!(await confirmDel('Supprimer ce message ?'))) return;
          await must(db().from(o.table).delete().eq('id', el.dataset.id));
          await win.cmd.render(win);
        }
      }
    });
  }
  inbox('questions', { table: 'student_questions', label: 'Questions', icon: '💬', color: '#c2417e', desc: 'Questions posées par les élèves', one: 'question', many: 'questions', empty: 'Aucune question reçue pour cette classe.' });
  inbox('submissions', { table: 'submissions', label: 'Travaux rendus', icon: '📥', color: '#0e7490', desc: 'Exercices envoyés par les élèves', one: 'travail reçu', many: 'travaux reçus', empty: 'Aucun travail reçu pour cette classe.' });

  /* ======================================================================
     Google Drive (chargé seulement à la demande)
     ====================================================================== */
  const D = (CP.drive = { token: null, exp: 0, client: null, resolve: null, reject: null });
  const GKEYS = ['GOOGLE_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_APP_ID'];
  D.configured = () => GKEYS.every((k) => CP.cfg[k] && !/VOTRE/i.test(CP.cfg[k]));
  D.getToken = () =>
    new Promise((resolve, reject) => {
      if (D.token && Date.now() < D.exp - 60000) return resolve(D.token);
      D.resolve = resolve; D.reject = reject;
      if (!D.client) {
        D.client = window.google.accounts.oauth2.initTokenClient({
          client_id: CP.cfg.GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (r) => {
            if (r.error) return D.reject(new Error('Connexion Google impossible : ' + r.error));
            D.token = r.access_token; D.exp = Date.now() + (Number(r.expires_in) || 3000) * 1000;
            D.resolve(D.token);
          },
          error_callback: (e) => D.reject(new Error('Connexion Google annulée' + (e && e.type ? ' (' + e.type + ')' : '') + '.'))
        });
      }
      D.client.requestAccessToken({ prompt: D.token ? '' : 'consent' });
    });
  D.pick = async ({ classId, kind, onDone }) => {
    if (!classId) return CP.toast('Choisissez d’abord une classe.', 'err');
    if (!D.configured()) return CP.toast('Google Drive n’est pas configuré : voir DEPLOIEMENT.md, étape 7.', 'err');
    try {
      CP.toast('Ouverture de Google Drive…');
      await Promise.all([CP.loadScript('https://apis.google.com/js/api.js'), CP.loadScript('https://accounts.google.com/gsi/client')]);
      const token = await D.getToken();
      await new Promise((ok, ko) => window.gapi.load('picker', { callback: ok, onerror: ko }));
      const g = window.google.picker;
      const picker = new g.PickerBuilder()
        .addView(new g.DocsView(g.ViewId.DOCS).setIncludeFolders(false).setSelectFolderEnabled(false))
        .addView(new g.DocsView(g.ViewId.PDFS))
        .enableFeature(g.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(token).setDeveloperKey(CP.cfg.GOOGLE_API_KEY).setAppId(CP.cfg.GOOGLE_APP_ID).setLocale('fr')
        .setCallback(async (data) => {
          if (data.action !== g.Action.PICKED) return;
          try {
            const rows = (data.docs || []).map((f) => ({
              class_id: classId, kind: kind || 'Ressource', title: (f.name || 'Document Google Drive').slice(0, 200),
              body: 'Document Google Drive. Vérifiez que le partage autorise vos élèves à l’ouvrir.',
              url: f.url || 'https://drive.google.com/open?id=' + encodeURIComponent(f.id), published: true
            }));
            if (rows.length) await must(db().from('materials').insert(rows));
            CP.toast(CP.pl(rows.length, 'document ajouté.', 'documents ajoutés.'));
            if (onDone) onDone();
          } catch (e) { CP.toast(CP.errMsg(e), 'err'); }
        }).build();
      picker.setVisible(true);
    } catch (e) { CP.toast(CP.errMsg(e), 'err'); }
  };

  def('drive', {
    label: 'Google Drive', icon: '☁️', color: '#1a73e8', desc: 'Ajouter des fichiers depuis votre Drive', needsClass: true, w: 600, h: 520,
    render(win) {
      const ok = D.configured();
      win.body.innerHTML =
        (ok ? '' : '<div class="callout warn"><b>Google Drive n’est pas encore configuré.</b><br>Renseignez la clé API, l’identifiant client et le numéro de projet dans <code>assets/js/config.js</code> (DEPLOIEMENT.md, étape 7).</div>') +
        '<div class="card"><h3>Importer des fichiers</h3>' +
        '<label class="field">Type de document<select name="kind" data-change="kind">' + ['Cours', 'Devoir', 'Exercice', 'Ressource'].map((k) => '<option' + (k === (win.state.kind || 'Ressource') ? ' selected' : '') + '>' + k + '</option>').join('') + '</select></label>' +
        '<button type="button" class="btn btn-primary" data-act="pick">Choisir des fichiers dans Drive</button>' +
        '<p class="muted" style="margin-top:10px">Les fichiers sont ajoutés comme liens dans la classe choisie en haut de cette fenêtre. Pour que les élèves puissent les ouvrir, le partage Google Drive du fichier doit leur donner accès (« Toute personne disposant du lien »).</p></div>';
    },
    change: { kind(win, el) { win.state.kind = el.value; } },
    click: { pick(win) { return CP.drive.pick({ classId: win.state.classId, kind: win.state.kind || 'Ressource', onDone: () => CP.wm.refresh(['materials']) }); } }
  });

  /* ======================================================================
     Aperçu élèves, Sauvegarde, Compte
     ====================================================================== */
  def('preview', {
    label: 'Aperçu élèves', icon: '🎓', color: '#4b5563', desc: 'Ouvre l’espace élèves dans un nouvel onglet', single: true,
    action() { window.open(CP.studentLink(), '_blank', 'noopener'); }
  });

  def('data', {
    label: 'Sauvegarde', icon: '💾', color: '#6b7280', desc: 'Télécharger toutes vos données', single: true, w: 560, h: 420,
    render(win) {
      win.body.innerHTML =
        '<div class="card"><h3>Copie de vos données</h3><p>Vos données sont enregistrées en ligne dans votre projet Supabase. Téléchargez régulièrement une copie sur votre ordinateur.</p>' +
        '<div class="row"><button type="button" class="btn btn-primary" data-act="json">Tout télécharger (JSON)</button><button type="button" class="btn" data-act="grades">Toutes les notes (Excel)</button></div>' +
        '<p class="muted" style="margin-top:10px">Les codes de classe ne sont pas inclus : ils ne sont conservés que sous forme chiffrée.</p></div>';
    },
    click: {
      async json(win, el) {
        el.disabled = true;
        try {
          const out = { exporte_le: new Date().toISOString(), version: 1 };
          for (const t of ['classes', 'students', 'materials', 'attendance', 'lessons', 'grades', 'student_questions', 'submissions']) {
            try { out[t] = await CP.fetchAll(t, t === 'classes' ? 'id,name,level,created_at' : '*'); } catch (e) { out[t] = []; }
          }
          CP.download('cartable-' + CP.today() + '.json', JSON.stringify(out, null, 2), 'application/json');
          CP.toast('Sauvegarde téléchargée.');
        } finally { el.disabled = false; }
      },
      async grades(win, el) {
        el.disabled = true;
        try {
          const [classes, rows] = await Promise.all([CP.fetchAll('classes', 'id,name'), CP.fetchAll('grades', '*')]);
          const nm = {}; classes.forEach((c) => (nm[c.id] = c.name));
          CP.download('notes-toutes-classes-' + CP.today() + '.csv', CP.csv([['Classe', 'Élève', 'Évaluation', 'Note', 'Sur', 'Note sur 20', 'Appréciation']]
            .concat(rows.map((r) => [nm[r.class_id] || '', r.student_name, r.assessment, r.score, r.max_score, CP.fmtNum(norm(r)), r.remark || '']))), 'text/csv');
        } finally { el.disabled = false; }
      }
    }
  });

  def('account', {
    label: 'Compte', icon: '⚙️', color: '#374151', desc: 'Mot de passe et déconnexion', single: true, w: 520, h: 460,
    render(win) {
      win.body.innerHTML =
        '<div class="card"><h3>Connexion</h3><p>Connecté en tant que <b>' + esc((S.user && S.user.email) || '') + '</b>.</p><button type="button" class="btn" data-act="logout">Se déconnecter</button></div>' +
        '<form class="card" data-submit="pw"><h3>Changer le mot de passe</h3>' +
        '<label class="field">Nouveau mot de passe <span class="hint-text">(10 caractères minimum)</span><input type="password" name="p1" minlength="10" required autocomplete="new-password"></label>' +
        '<label class="field">Confirmer le mot de passe<input type="password" name="p2" minlength="10" required autocomplete="new-password"></label>' +
        '<button class="btn btn-primary">Changer le mot de passe</button></form>';
    },
    submit: {
      async pw(win, f) {
        if (f.elements.p1.value !== f.elements.p2.value) return CP.toast('Les deux mots de passe sont différents.', 'err');
        await must(db().auth.updateUser({ password: f.elements.p1.value }).then((r) => ({ data: r.data, error: r.error })));
        f.reset();
        CP.toast('Mot de passe modifié.');
      }
    },
    click: { logout() { return CP.app.logout(); } }
  });

  /* ======================================================================
     Bureau du professeur (lanceur) et résumé
     ====================================================================== */
  T.groups = [
    { title: 'Classes et élèves', ids: ['classes', 'students'] },
    { title: 'Au quotidien', ids: ['attendance', 'journal', 'grades'] },
    { title: 'Contenus pour les élèves', ids: ['course', 'homework', 'exercise', 'resource', 'drive'] },
    { title: 'Retours des élèves', ids: ['questions', 'submissions'] },
    { title: 'Outils', ids: ['preview', 'data', 'account'] }
  ];
  T.deskHtml = () =>
    '<div class="launcher"><section class="hello"><h1>Bonjour</h1><span class="date muted">' + esc(CP.longDate()) + '</span>' +
    '<div id="summary" class="summary" aria-live="polite">Chargement de vos classes…</div></section>' +
    T.groups.map((g) => '<section class="group"><h2>' + esc(g.title) + '</h2><div class="tiles">' + g.ids.map((id) => CP.tile(cmds[id])).join('') + '</div></section>').join('') +
    '<p class="hint">Chaque outil s’ouvre dans sa propre fenêtre : faites-la glisser par sa barre de titre, redimensionnez-la par ses bords, réduisez-la dans la barre du bas. ' +
    'Maintenez Maj ou Ctrl en cliquant sur un outil pour en ouvrir une seconde fenêtre (par exemple pour comparer deux classes).</p></div>';

  T.afterDesk = async () => {
    try { await CP.loadClasses(); } catch (e) { CP.toast(CP.errMsg(e), 'err'); }
    T.loadSummary();
  };
  T.loadSummary = async () => {
    const el = $('#summary');
    if (!el || !S.user) return;
    const c = S.classes.find((x) => x.id === S.activeClassId);
    if (!c) {
      el.innerHTML = '<p>Aucune classe pour le moment.</p><p><button type="button" class="link" data-open="classes">Créez votre première classe</button> pour commencer.</p>';
      return;
    }
    const count = (t, f) => {
      let q = db().from(t).select('id', { count: 'exact', head: true }).eq('class_id', c.id);
      if (f) q = f(q);
      return q.then((r) => (r.error ? null : r.count), () => null);
    };
    const [stu, docs, qs, subs, last] = await Promise.all([
      count('students'), count('materials', (q) => q.eq('published', true)), count('student_questions'), count('submissions'),
      db().from('lessons').select('lesson_date,title').eq('class_id', c.id).order('lesson_date', { ascending: false }).limit(1).then((r) => (r.error ? null : (r.data || [])[0]), () => null)
    ]);
    if (!$('#summary')) return;
    const item = (n, one, many, id) => '<li><button type="button" class="link" data-open="' + id + '">' + (n == null ? '—' : CP.pl(n, one, many)) + '</button></li>';
    $('#summary').innerHTML =
      '<p><b>' + esc(c.name) + '</b> <span class="muted">' + esc(c.level) + '</span></p><ul>' +
      item(stu, 'élève', 'élèves', 'students') + item(docs, 'document visible', 'documents visibles', 'resource') +
      item(qs, 'question', 'questions', 'questions') + item(subs, 'travail reçu', 'travaux reçus', 'submissions') + '</ul>' +
      (last ? '<p class="muted" style="margin-top:4px">Dernière séance : ' + esc(CP.fmtDate(last.lesson_date)) + ' — ' + esc(last.title) + '</p>' : '');
  };
})();
