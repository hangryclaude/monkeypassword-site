// cinema.js — the full-bleed "Monkeytheorem" interlude. Plays the background film WITH
// SOUND when it scrolls into view. Browsers only allow audio after a user gesture, so:
// if the visitor has interacted (password, a button, a tap), sound plays on entry;
// otherwise it plays muted and a "sound" button appears. Pauses when scrolled away.
'use strict';
(function () {
  const sec = document.getElementById('cinema');
  const vid = document.getElementById('cinemaVid');
  const btn = document.getElementById('cinemaSound');
  if (!sec || !vid) return;
  let gestured = false, inView = false;

  function playPreferSound() {
    vid.muted = !gestured;                 // sound if allowed, else muted (autoplay policy)
    const p = vid.play();
    if (p && p.catch) p.catch(() => { vid.muted = true; vid.play().catch(() => {}); if (btn) btn.hidden = false; });
    if (btn) btn.hidden = !vid.muted;      // offer the "sound" button only while muted
  }
  function enableSound() {
    gestured = true; vid.muted = false;
    vid.play().then(() => { if (btn) btn.hidden = true; }).catch(() => {});
  }
  // the first genuine interaction anywhere unlocks audio; unmute live if we're in the scene
  ['pointerdown', 'keydown', 'touchstart'].forEach(e =>
    addEventListener(e, () => { gestured = true; if (inView && vid.muted) enableSound(); }, { passive: true }));
  if (btn) btn.addEventListener('click', enableSound);

  new IntersectionObserver((es) => {
    inView = es[0].isIntersecting;
    if (inView) playPreferSound();
    else { vid.pause(); if (btn) btn.hidden = true; }
  }, { threshold: 0.5 }).observe(sec);
})();
