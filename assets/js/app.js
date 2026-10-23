/* Cartable — routeur des pages (#accueil, #prof, #eleve), en-tête, connexion, démarrage. */
(function () {
  'use strict';
  const CP = window.CP, $ = CP.$, $$ = CP.$$, esc = CP.esc, S = CP.state;
  const app = (CP.app = {});
  let view = null;

  const TITLES = {
    home: 'Cartable du professeur d’informatique',
    prof: 'Espace professeur · Cartable',
    eleve: 'Espace élèves · Cartable'
  };
  const viewFromHash = () => {
    const h = (location.hash || '').replace(/^#/, '').split(/[/?&]/)[0];
    return h === 'prof' ? 'prof' : h === 'eleve' ? 'eleve' : 'home';
  };

  /* ---------- Pages ---------- */
  const configNotice = () =>
    '<div class="sheet" style="--tab:var(--warn)"><h1>Configuration nécessaire</h1>' +
    '<p>Renseignez <code>SUPABASE_URL</code> et <code>SUPABASE_ANON_KEY</code> dans <code>assets/js/config.js</code>, puis déposez de nouveau le site.</p>' +
    '<p class="muted">N’écrivez jamais la clé <code>service_role</code> dans ce fichier. Toutes les étapes sont dans DEPLOIEMENT.md.</p></div>';

  const landing = () =>
    '<div class="landing"><section class="hero"><h1>Le cartable du professeur d’informatique</h1>' +
    '<p class="lead">Appel, cahier de texte, cours, devoirs et notes. Chaque outil s’ouvre dans sa propre fenêtre : on la déplace, on l’agrandit, on la garde à côté d’une autre.</p></section>' +
    '<div class="entries"><a class="entry" href="#eleve" style="--tab:#2e8b57"><b>Espace élèves</b>' +
    '<span>Retrouver les documents de ma classe avec le code donné par mon professeur.</span><span class="btn btn-primary">Entrer avec mon code</span></a>' +
    '<a class="entry" href="#prof" style="--tab:#2f4fd1"><b>Espace professeur</b>' +
    '<span>Gérer les classes, l’appel, le cahier de texte, les notes et les contenus.</span><span class="btn">Se connecter</span></a></div>' +
    '<p class="legal">Les données sont enregistrées dans le projet Supabase de l’établissement. Avant un usage avec de vraies données d’élèves, vérifiez les règles d’accès et les obligations de protection des données applicables.</p></div>';

  const loginView = () =>
    '<div class="sheet" style="--tab:#2f4fd1"><p class="bar-link"><a href="#accueil">← Accueil</a></p><h1>Espace professeur</h1>' +
    '<p class="muted">Connectez-vous avec votre compte sécurisé.</p>' +
    '<form data-form="login"><label class="field">Adresse e-mail<input name="email" type="email" required autocomplete="username" placeholder="professeur@exemple.tn"></label>' +
    '<label class="field">Mot de passe<input name="password" type="password" required autocomplete="current-password"></label>' +
    '<button class="btn btn-primary btn-lg">Se connecter</button></form>' +
    '<p style="margin-top:14px"><button type="button" class="link" data-act="reset">Mot de passe oublié ?</button>' +
    (CP.cfg.ALLOW_SIGNUP ? ' · <button type="button" class="link" data-act="signup">Créer un compte</button>' : '') + '</p></div>';

  const unlockView = () =>
    '<div class="sheet" style="--tab:#2e8b57"><p class="bar-link"><a href="#accueil">← Accueil</a></p><h1>Espace élèves</h1>' +
    '<p class="muted">Saisissez le code donné par votre professeur pour ouvrir le cartable de votre classe.</p>' +
    '<form data-form="unlock"><label class="field">Code de la classe<input name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="INFO-XXXXXXXXX" minlength="8" maxlength="40"></label>' +
    '<label class="field">Nom et prénom<input name="name" required minlength="2" maxlength="120" autocomplete="name" value="' + esc(CP.student.savedName()) + '"></label>' +
    '<button class="btn btn-primary btn-lg">Ouvrir mon cartable</button></form></div>';

  /* ---------- En-tête ---------- */
  app.renderHeader = () => {
    const box = $('#top-right');
    if (!box) return;
    let h = '';
    if (view === 'prof' && S.user) {
      h += '<label class="top-class"><span class="sr">Classe active</span><select id="active-class" aria-label="Classe active">' +
        (CP.classOptions(S.activeClassId) || '<option value="">Aucune classe</option>') + '</select></label>';
    }
    if (view === 'eleve' && S.student) h += '<span class="top-who">' + esc(S.student.className) + '</span>';
    h += '<button type="button" class="btn btn-quiet btn-sm" data-act="theme" aria-label="Changer de thème clair ou sombre">◐ Thème</button>';
    if (view === 'prof' && S.user) h += '<button type="button" class="btn btn-quiet btn-sm" data-act="logout">Se déconnecter</button>';
    if (view === 'eleve' && S.student) h += '<button type="button" class="btn btn-quiet btn-sm" data-act="quit">Quitter</button>';
    box.innerHTML = h;
  };
  app.markOpen = () => {
    const open = new Set(CP.wm.list().map((w) => w.cmd.id));
    $$('.tile').forEach((t) => t.classList.toggle('is-open', open.has(t.dataset.open)));
  };
  app.refreshStudentDesk = () => { if (view === 'eleve' && S.student) { $('#main').innerHTML = CP.student.deskHtml(); app.markOpen(); } };

  /* ---------- Rendu principal ---------- */
  function render() {
    const v = viewFromHash();
    if (v !== view) CP.wm.closeAll();
    view = v;
    document.body.dataset.view = v;
    document.title = TITLES[v];
    const main = $('#main');
    if (!CP.configured || !CP.db) main.innerHTML = CP.configured ? '<div class="sheet"><h1>Chargement impossible</h1><p>La bibliothèque Supabase n’a pas pu être chargée (assets/vendor/supabase.js).</p></div>' : configNotice();
    else if (v === 'home') main.innerHTML = landing();
    else if (v === 'prof') {
      if (!S.user) main.innerHTML = loginView();
      else { main.innerHTML = CP.teacher.deskHtml(); CP.teacher.afterDesk(); }
    } else main.innerHTML = S.student ? CP.student.deskHtml() : unlockView();
    app.renderHeader();
    app.markOpen();
    main.scrollTop = 0;
    const first = $('input', main);
    if (first && /^(prof|eleve)$/.test(v) && !(S.user && v === 'prof') && !(S.student && v === 'eleve')) first.focus({ preventScroll: true });
  }

  /* ---------- Actions ---------- */
  app.logout = async () => {
    CP.wm.closeAll();
    await CP.db.auth.signOut();
    S.user = null; S.classes = []; S.activeClassId = null;
    render();
    CP.toast('Vous êtes déconnecté.');
  };
  const theme = () => {
    const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('cartable.theme', next); } catch (e) { /* ignoré */ }
  };
  const busy = (form, on) => { const b = $('button:not([type="button"])', form); if (b) b.disabled = on; };
  const fail = (e) => CP.toast(CP.errMsg(e), 'err');

  const forms = {
    async login(f) {
      busy(f, true);
      try {
        const { data, error } = await CP.db.auth.signInWithPassword({ email: f.elements.email.value.trim(), password: f.elements.password.value });
        if (error) throw error;
        S.user = data.user;
        render();
      } finally { busy(f, false); }
    },
    async unlock(f) {
      busy(f, true);
      try {
        await CP.student.unlock(f.elements.code.value, f.elements.name.value.trim());
        render();
      } finally { busy(f, false); }
    }
  };
  const acts = {
    theme,
    logout: () => app.logout().catch(fail),
    quit: () => { CP.wm.closeAll(); CP.student.quit(); render(); },
    async reset() {
      const email = ($('input[name="email"]') || {}).value;
      if (!email) return CP.toast('Saisissez d’abord votre adresse e-mail ci-dessus.', 'err');
      const { error } = await CP.db.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.href.split('#')[0] });
      if (error) throw error;
      CP.toast('Un e-mail de réinitialisation vient d’être envoyé (s’il existe un compte à cette adresse).');
    },
    async signup() {
      const f = $('form[data-form="login"]');
      if (f.elements.password.value.length < 10) return CP.toast('Choisissez un mot de passe d’au moins 10 caractères.', 'err');
      const { error } = await CP.db.auth.signUp({ email: f.elements.email.value.trim(), password: f.elements.password.value });
      if (error) throw error;
      CP.toast('Compte demandé. Ouvrez le message de confirmation reçu par e-mail, puis connectez-vous.');
    }
  };

  function wire() {
    document.addEventListener('click', (e) => {
      const open = e.target.closest('[data-open]');
      if (open) {
        const cmd = CP.commands[open.dataset.open];
        if (!cmd) return;
        if (cmd.action) cmd.action();
        else CP.wm.open(cmd, { fresh: e.shiftKey || e.ctrlKey || e.metaKey });
        return;
      }
      const a = e.target.closest('#top [data-act], #main [data-act]');
      if (a && acts[a.dataset.act]) {
        const r = acts[a.dataset.act]();
        if (r && r.catch) r.catch(fail);
      }
    });
    document.addEventListener('submit', (e) => {
      const f = e.target.closest('form[data-form]');
      if (!f) return;
      e.preventDefault();
      const r = forms[f.dataset.form](f);
      if (r && r.catch) r.catch(fail);
    });
    $('#top').addEventListener('change', (e) => {
      if (e.target.id === 'active-class') { CP.setActive(e.target.value); }
    });
    window.addEventListener('hashchange', render);
  }

  /* ---------- Démarrage ---------- */
  async function boot() {
    CP.wm.init();
    wire();
    if (CP.db) {
      try {
        const { data } = await CP.db.auth.getSession();
        S.user = (data.session && data.session.user) || null;
      } catch (e) { S.user = null; }
      CP.db.auth.onAuthStateChange((evt, session) => {
        const had = !!S.user;
        S.user = (session && session.user) || null;
        // setTimeout : évite d'appeler Supabase à l'intérieur du rappel d'authentification.
        setTimeout(() => {
          if (evt === 'PASSWORD_RECOVERY') {
            location.hash = '#prof';
            render();
            CP.wm.open(CP.commands.account);
          } else if (had !== !!S.user) render();
        }, 0);
      });
    }
    if (viewFromHash() === 'eleve') {
      try {
        const raw = sessionStorage.getItem('cartable.student');
        if (raw) { const s = JSON.parse(raw); await CP.student.unlock(s.code, s.name, true); }
      } catch (e) { CP.student.quit(); }
    }
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
