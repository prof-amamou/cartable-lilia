/* Applique le thème choisi avant l'affichage (évite le flash blanc). */
(function () {
  try {
    var t = localStorage.getItem('cartable.theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
