// Motion V2 do Production Hub.
// Feedback visual leve e drag otimista sem animacao lateral.

const motionStyle = document.createElement('style');
motionStyle.textContent = `
  :root {
    --motion-fast: 140ms;
    --motion-base: 220ms;
    --motion-slow: 320ms;
    --motion-ease: cubic-bezier(.2,.8,.2,1);
    --motion-spring: cubic-bezier(.16,1,.3,1);
  }

  html { scroll-behavior: smooth; }

  .btn,
  .nav button,
  .avatar-button,
  .status-btn,
  .project-card,
  .resource,
  .panel,
  .resume-card,
  .task-card,
  .column,
  .badge,
  .select {
    transition:
      transform var(--motion-base) var(--motion-ease),
      box-shadow var(--motion-base) var(--motion-ease),
      border-color var(--motion-base) var(--motion-ease),
      background-color var(--motion-base) var(--motion-ease),
      color var(--motion-base) var(--motion-ease),
      opacity var(--motion-base) var(--motion-ease);
  }

  .btn:not(:disabled):hover,
  .status-btn:not(:disabled):hover { transform: translateY(-1px); }

  .btn:not(:disabled):active,
  .status-btn:not(:disabled):active,
  .avatar-button:active,
  .nav button:active {
    transform: scale(.975);
    transition-duration: var(--motion-fast);
  }

  .project-card:hover,
  .resource:hover,
  .resume-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 34px rgba(25,35,55,.085);
  }

  .panel:hover { box-shadow: 0 13px 32px rgba(25,35,55,.075); }

  .task-card:not(.dragging):not(.motion-dragging):hover {
    transform: translateY(-2px);
    box-shadow: 0 9px 22px rgba(30,40,60,.085);
    border-color: #d6dae2;
  }

  .nav button.active { animation: navSelect 220ms var(--motion-spring) both; }
  .view.active.motion-view-enter { animation: viewEnter var(--motion-slow) var(--motion-spring) both; }
  .motion-enter { animation: itemEnter 280ms var(--motion-spring) both; }
  dialog[open] { animation: dialogIn 230ms var(--motion-spring) both; }
  dialog[open]::backdrop { animation: backdropIn 190ms ease-out both; }
  .toast.show { animation: toastIn 250ms var(--motion-spring) both; }
  .bar i { transition: width 500ms var(--motion-spring); }

  .column { position: relative; }
  .dropzone {
    transition: background-color var(--motion-base) var(--motion-ease), box-shadow var(--motion-base) var(--motion-ease);
  }

  .column.is-drag-target,
  .dropzone.is-drag-target { background: rgba(95,99,242,.055); }

  .column.is-drag-target {
    border-color: rgba(95,99,242,.36);
    box-shadow: inset 0 0 0 1px rgba(95,99,242,.08);
  }

  .task-card.dragging,
  .task-card.motion-dragging {
    opacity: .3 !important;
    transform: scale(.985) !important;
    box-shadow: none !important;
  }

  .task-drop-placeholder {
    height: 86px;
    margin: 0 0 9px;
    border: 1.5px dashed rgba(95,99,242,.45);
    border-radius: 13px;
    background: rgba(95,99,242,.055);
    animation: placeholderIn 150ms var(--motion-ease) both;
    pointer-events: none;
  }

  /* O card apenas aparece no local solto. Sem FLIP, translate ou voo lateral. */
  .task-card.optimistic-moving {
    opacity: 1 !important;
    transform: none !important;
    position: relative;
    z-index: 2;
    border-color: rgba(95,99,242,.24);
    box-shadow: 0 8px 20px rgba(56,61,190,.10);
  }

  .board.is-dragging .column:not(.is-drag-target) { opacity: .86; }

  @keyframes viewEnter {
    from { opacity: 0; transform: translateY(7px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes itemEnter {
    from { opacity: 0; transform: translateY(6px) scale(.994); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes navSelect { from { transform: scale(.97); } to { transform: scale(1); } }
  @keyframes dialogIn {
    from { opacity: 0; transform: translateY(10px) scale(.987); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes backdropIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes toastIn {
    from { opacity: 0; transform: translateY(9px) scale(.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes placeholderIn { from { opacity: 0; } to { opacity: 1; } }

  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    *, *::before, *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
      scroll-behavior: auto !important;
    }
  }
`;
document.head.appendChild(motionStyle);

function cardIdentity(card) {
  if (!card) return '';
  const direct = card.dataset.taskId || card.dataset.id || card.getAttribute('data-task-id') || card.getAttribute('data-id');
  if (direct) return `id:${direct}`;
  const nested = card.querySelector('[data-task-id],[data-id]');
  const nestedId = nested?.dataset?.taskId || nested?.dataset?.id;
  if (nestedId) return `id:${nestedId}`;
  const title = card.querySelector('.task-title')?.textContent?.trim() || '';
  const footer = card.querySelector('.card-footer')?.textContent?.trim() || '';
  const meta = card.querySelector('.task-meta')?.textContent?.trim() || '';
  return `text:${title}|${meta}|${footer}`.replace(/\s+/g, ' ');
}

function findMatchingCard(identity) {
  if (!identity) return null;
  return [...document.querySelectorAll('.task-card')].find(card => cardIdentity(card) === identity) || null;
}

function zoneIdentity(zone) {
  if (!zone) return '';
  const explicit = zone.dataset.status || zone.dataset.column || zone.dataset.state || zone.getAttribute('data-status');
  if (explicit) return `data:${explicit}`;
  const column = zone.closest('.column');
  const head = column?.querySelector('.column-head')?.textContent || '';
  return `head:${head.replace(/\d+/g, '').trim().toLowerCase()}`;
}

function findZone(identity) {
  if (!identity) return null;
  return [...document.querySelectorAll('.dropzone')].find(zone => zoneIdentity(zone) === identity) || null;
}

function refreshColumnCounts() {
  document.querySelectorAll('.column').forEach(column => {
    const count = column.querySelectorAll('.dropzone .task-card').length;
    const bubble = column.querySelector('.column-count');
    if (bubble) bubble.textContent = String(count);
  });
}

let dragState = null;
let placeholder = null;
let optimisticLock = null;
let lockTimer = null;

function clearTargets() {
  document.querySelectorAll('.is-drag-target').forEach(el => el.classList.remove('is-drag-target'));
  document.querySelector('.board')?.classList.remove('is-dragging');
}

function clearPlaceholder() {
  placeholder?.remove();
  placeholder = null;
}

function releaseOptimisticLock() {
  optimisticLock = null;
  clearTimeout(lockTimer);
  lockTimer = null;
}

function createPlaceholder(card) {
  clearPlaceholder();
  placeholder = document.createElement('div');
  placeholder.className = 'task-drop-placeholder';
  const rect = card?.getBoundingClientRect();
  if (rect?.height) placeholder.style.height = `${Math.max(72, rect.height)}px`;
}

document.addEventListener('dragstart', event => {
  const card = event.target?.closest?.('.task-card');
  if (!card) return;
  dragState = {
    card,
    identity: cardIdentity(card),
    sourceKey: zoneIdentity(card.closest('.dropzone')),
  };
  card.classList.add('motion-dragging');
  document.querySelector('.board')?.classList.add('is-dragging');
  createPlaceholder(card);
}, true);

document.addEventListener('dragover', event => {
  if (!dragState) return;
  const zone = event.target?.closest?.('.dropzone');
  if (!zone) return;
  document.querySelectorAll('.is-drag-target').forEach(el => el.classList.remove('is-drag-target'));
  zone.classList.add('is-drag-target');
  zone.closest('.column')?.classList.add('is-drag-target');
  if (placeholder && placeholder.parentElement !== zone) zone.appendChild(placeholder);
}, true);

document.addEventListener('drop', event => {
  if (!dragState) return;
  const zone = event.target?.closest?.('.dropzone');
  if (!zone) return;

  const { card, sourceKey, identity } = dragState;
  const targetKey = zoneIdentity(zone);

  if (targetKey && targetKey !== sourceKey) {
    clearPlaceholder();
    zone.appendChild(card);
    card.getAnimations?.().forEach(animation => animation.cancel());
    card.classList.remove('motion-dragging', 'dragging', 'motion-enter');
    card.classList.add('optimistic-moving');
    refreshColumnCounts();

    // Guardamos a identidade da coluna, nunca o elemento DOM.
    // Assim um re-render do realtime não consegue fazer o card desaparecer.
    optimisticLock = { identity, targetKey, expiresAt: Date.now() + 2400 };
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
      const live = findMatchingCard(identity);
      live?.classList.remove('optimistic-moving');
      releaseOptimisticLock();
      refreshColumnCounts();
    }, 2400);
  }

  clearTargets();
  dragState = null;
}, true);

document.addEventListener('dragend', () => {
  dragState?.card?.classList.remove('motion-dragging');
  dragState = null;
  clearPlaceholder();
  clearTargets();
}, true);

const boardObserver = new MutationObserver(mutations => {
  if (optimisticLock && Date.now() < optimisticLock.expiresAt) {
    const liveCard = findMatchingCard(optimisticLock.identity);
    const currentTarget = findZone(optimisticLock.targetKey);
    if (liveCard && currentTarget && liveCard.closest('.dropzone') !== currentTarget) {
      currentTarget.appendChild(liveCard);
      liveCard.getAnimations?.().forEach(animation => animation.cancel());
      liveCard.classList.remove('motion-enter', 'motion-dragging', 'dragging');
      liveCard.classList.add('optimistic-moving');
      refreshColumnCounts();
    }
  }

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const candidates = [];
      if (node.matches?.('.project-card,.resource,.activity-item')) candidates.push(node);
      candidates.push(...(node.querySelectorAll?.('.project-card,.resource,.activity-item') || []));
      for (const el of candidates) {
        el.classList.add('motion-enter');
        setTimeout(() => el.classList.remove('motion-enter'), 360);
      }
    }
  }
});

boardObserver.observe(document.body, { subtree: true, childList: true });

let activeView = document.querySelector('.view.active');
const viewObserver = new MutationObserver(() => {
  const next = document.querySelector('.view.active');
  if (!next || next === activeView) return;
  activeView = next;
  next.classList.remove('motion-view-enter');
  void next.offsetWidth;
  next.classList.add('motion-view-enter');
  setTimeout(() => next.classList.remove('motion-view-enter'), 400);
});

viewObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
