// Motion leve do Production Hub.
// No board, esta camada e apenas visual: nao altera tarefa, status, ordem ou coluna.

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

  /* Board: sem animacao de troca de coluna. */
  .task-card {
    transition: box-shadow 120ms ease, border-color 120ms ease, opacity 120ms ease !important;
  }

  .task-card:not(.dragging):not(.motion-dragging):hover {
    box-shadow: 0 8px 20px rgba(30,40,60,.075);
    border-color: #d6dae2;
  }

  /* O card original fica discreto enquanto o ghost acompanha o cursor. */
  .task-card.dragging,
  .task-card.motion-dragging {
    opacity: .22 !important;
    transform: none !important;
    animation: none !important;
  }

  /* Coluna atualmente apontada pelo cursor. */
  .column.motion-drag-target {
    border-color: rgba(95,99,242,.46) !important;
    background: #f0f0fb !important;
  }

  .dropzone.motion-drag-target {
    background: rgba(95,99,242,.035) !important;
  }

  /* Apenas um marcador visual. Nao representa uma segunda tarefa. */
  .task-drop-placeholder {
    margin: 0 0 9px;
    border: 1.5px dashed rgba(95,99,242,.52);
    border-radius: 13px;
    background: rgba(95,99,242,.055);
    pointer-events: none;
    box-sizing: border-box;
  }

  /* Copia usada exclusivamente como imagem de drag do navegador. */
  .task-drag-ghost {
    position: fixed !important;
    left: -10000px !important;
    top: -10000px !important;
    z-index: -1 !important;
    margin: 0 !important;
    opacity: .96 !important;
    transform: rotate(.7deg) scale(1.015) !important;
    box-shadow: 0 14px 34px rgba(25,35,55,.18) !important;
    pointer-events: none !important;
  }

  /* Neutraliza classes antigas caso ainda sobrem em algum render. */
  .task-card.optimistic-moving,
  .task-card.motion-enter {
    animation: none !important;
    transform: none !important;
  }

  .nav button.active { animation: navSelect 220ms var(--motion-spring) both; }
  .view.active.motion-view-enter { animation: viewEnter var(--motion-slow) var(--motion-spring) both; }
  dialog[open] { animation: dialogIn 220ms var(--motion-spring) both; }
  dialog[open]::backdrop { animation: backdropIn 180ms ease-out both; }
  .toast.show { animation: toastIn 240ms var(--motion-spring) both; }
  .bar i { transition: width 500ms var(--motion-spring); }

  @keyframes viewEnter {
    from { opacity: 0; transform: translateY(7px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes navSelect {
    from { transform: scale(.97); }
    to { transform: scale(1); }
  }

  @keyframes dialogIn {
    from { opacity: 0; transform: translateY(10px) scale(.988); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes backdropIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes toastIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

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

let draggedCard = null;
let placeholder = null;
let dragGhost = null;
let activeZone = null;

function removePlaceholder() {
  placeholder?.remove();
  placeholder = null;
}

function clearTarget() {
  activeZone?.classList.remove('motion-drag-target');
  activeZone?.closest('.column')?.classList.remove('motion-drag-target');
  activeZone = null;
}

function clearBoardDragVisuals() {
  draggedCard?.classList.remove('motion-dragging');
  document.querySelectorAll('.task-card.motion-dragging').forEach(el => el.classList.remove('motion-dragging'));
  removePlaceholder();
  clearTarget();
  dragGhost?.remove();
  dragGhost = null;
  draggedCard = null;
}

function showTarget(zone) {
  if (!zone) return;
  if (activeZone !== zone) {
    clearTarget();
    activeZone = zone;
    activeZone.classList.add('motion-drag-target');
    activeZone.closest('.column')?.classList.add('motion-drag-target');
  }

  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.className = 'task-drop-placeholder';
    const height = draggedCard?.getBoundingClientRect().height || 86;
    placeholder.style.height = `${Math.max(72, Math.round(height))}px`;
  }

  if (placeholder.parentElement !== zone) zone.appendChild(placeholder);
}

// Feedback visual do drag. Nao intercepta o drop e nao move o card real.
document.addEventListener('dragstart', event => {
  const card = event.target?.closest?.('.task-card');
  if (!card) return;

  clearBoardDragVisuals();
  draggedCard = card;
  card.classList.add('motion-dragging');

  // Garante que o usuario veja o card acompanhando o mouse de forma consistente.
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    dragGhost = card.cloneNode(true);
    dragGhost.classList.remove('dragging', 'motion-dragging', 'optimistic-moving', 'motion-enter');
    dragGhost.classList.add('task-drag-ghost');
    const rect = card.getBoundingClientRect();
    dragGhost.style.width = `${Math.round(rect.width)}px`;
    document.body.appendChild(dragGhost);
    event.dataTransfer.setDragImage(dragGhost, Math.min(28, rect.width / 2), 22);
  }
}, true);

document.addEventListener('dragover', event => {
  if (!draggedCard) return;
  const zone = event.target?.closest?.('.dropzone');
  if (zone) showTarget(zone);
  else {
    removePlaceholder();
    clearTarget();
  }
}, true);

// Limpa apenas o feedback visual. O board-stability e o realtime cuidam da tarefa real.
document.addEventListener('drop', () => {
  removePlaceholder();
  clearTarget();
  dragGhost?.remove();
  dragGhost = null;
}, true);

document.addEventListener('dragend', () => {
  clearBoardDragVisuals();
}, true);

// Transicao leve somente ao trocar de secao. Nao observa nem anima cards do board.
let activeView = document.querySelector('.view.active');
const viewObserver = new MutationObserver(() => {
  const next = document.querySelector('.view.active');
  if (!next || next === activeView) return;
  activeView = next;
  next.classList.remove('motion-view-enter');
  void next.offsetWidth;
  next.classList.add('motion-view-enter');
  setTimeout(() => next.classList.remove('motion-view-enter'), 380);
});

viewObserver.observe(document.body, {
  subtree: true,
  attributes: true,
  attributeFilter: ['class'],
});
