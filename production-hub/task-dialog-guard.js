// Protege o modal de tarefa contra aberturas involuntarias.
// 1. Um arrasto nao pode virar clique de edicao ao soltar.
// 2. O navegador nao pode restaurar o taskDialog aberto ao entrar no Hub.

let pointerTrack = null;
let suppressCardClickUntil = 0;
let lastIntentionalCardClick = 0;
const bootStartedAt = performance.now();
const BOOT_GUARD_MS = 3000;

function taskDialog() {
  return document.getElementById('taskDialog');
}

function closeTaskDialog() {
  const dialog = taskDialog();
  if (!dialog?.open) return;
  try { dialog.close(); } catch {
    dialog.removeAttribute('open');
  }
}

function shouldSuppressOpen() {
  const now = performance.now();
  const bootingWithoutIntent = now - bootStartedAt < BOOT_GUARD_MS && now - lastIntentionalCardClick > 700;
  const justDragged = now < suppressCardClickUntil;
  return bootingWithoutIntent || justDragged;
}

// Fecha qualquer estado restaurado pelo navegador assim que o patch entra.
closeTaskDialog();
queueMicrotask(closeTaskDialog);
setTimeout(() => {
  if (performance.now() - lastIntentionalCardClick > 700) closeTaskDialog();
}, 120);

window.addEventListener('pageshow', () => {
  lastIntentionalCardClick = 0;
  closeTaskDialog();
  setTimeout(closeTaskDialog, 80);
}, true);

// Acompanha o gesto no nivel da window. Assim sabemos que foi arrasto antes
// de qualquer listener antigo do app receber o pointerup/click no card.
window.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  const card = event.target?.closest?.('.task-card');
  if (!card) {
    pointerTrack = null;
    return;
  }

  pointerTrack = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };
}, true);

window.addEventListener('pointermove', event => {
  const track = pointerTrack;
  if (!track || track.pointerId !== event.pointerId || track.moved) return;
  const dx = event.clientX - track.startX;
  const dy = event.clientY - track.startY;
  if ((dx * dx) + (dy * dy) >= 36) track.moved = true;
}, true);

window.addEventListener('pointerup', event => {
  const track = pointerTrack;
  if (!track || track.pointerId !== event.pointerId) return;

  const wasDrag = track.moved || document.body.classList.contains('board-pointer-active');
  pointerTrack = null;

  if (!wasDrag) return;

  // Tempo folgado para cobrir o click sintetico do Chromium/Brave.
  suppressCardClickUntil = performance.now() + 1200;

  // Se algum listener antigo abrir o modal no proprio pointerup,
  // fechamos no proximo microtask sem interferir no movimento do board.
  queueMicrotask(() => {
    if (performance.now() < suppressCardClickUntil) closeTaskDialog();
  });
  setTimeout(() => {
    if (performance.now() < suppressCardClickUntil) closeTaskDialog();
  }, 0);
}, true);

window.addEventListener('pointercancel', event => {
  if (pointerTrack?.pointerId === event.pointerId) pointerTrack = null;
}, true);

// Captura o click antes de ele chegar no card/documento.
window.addEventListener('click', event => {
  const card = event.target?.closest?.('.task-card');
  if (!card) return;

  if (performance.now() < suppressCardClickUntil) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    closeTaskDialog();
    return;
  }

  lastIntentionalCardClick = performance.now();
}, true);

// Ultima barreira: se o atributo open aparecer por restauracao de estado
// ou por um evento residual de drag, removemos imediatamente.
const dialog = taskDialog();
if (dialog) {
  const observer = new MutationObserver(() => {
    if (dialog.open && shouldSuppressOpen()) closeTaskDialog();
  });
  observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
}
