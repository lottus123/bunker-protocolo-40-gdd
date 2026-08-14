// Motion leve do Production Hub.
// O board usa apenas o drag nativo do app: sem mover cards manualmente,
// sem placeholder, sem FLIP e sem lógica otimista paralela.

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
  .status-btn:not(:disabled):hover {
    transform: translateY(-1px);
  }

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

  .panel:hover {
    box-shadow: 0 13px 32px rgba(25,35,55,.075);
  }

  /* Card de tarefa: nada de animação ao mudar de coluna. */
  .task-card {
    transition:
      box-shadow var(--motion-fast) ease,
      border-color var(--motion-fast) ease,
      opacity var(--motion-fast) ease !important;
  }

  .task-card:not(.dragging):hover {
    box-shadow: 0 8px 20px rgba(30,40,60,.075);
    border-color: #d6dae2;
  }

  /* Durante o drag, o card original só fica levemente translúcido.
     O navegador continua mostrando o ghost nativo sendo arrastado. */
  .task-card.dragging,
  .task-card.motion-dragging {
    opacity: .5 !important;
    transform: none !important;
    animation: none !important;
  }

  /* Neutraliza qualquer classe residual das versões anteriores. */
  .task-card.optimistic-moving,
  .task-card.motion-enter {
    animation: none !important;
    transform: none !important;
  }

  .task-drop-placeholder {
    display: none !important;
  }

  .column,
  .dropzone,
  .board.is-dragging .column,
  .column.is-drag-target,
  .dropzone.is-drag-target {
    animation: none !important;
  }

  .nav button.active {
    animation: navSelect 220ms var(--motion-spring) both;
  }

  .view.active.motion-view-enter {
    animation: viewEnter var(--motion-slow) var(--motion-spring) both;
  }

  dialog[open] {
    animation: dialogIn 220ms var(--motion-spring) both;
  }

  dialog[open]::backdrop {
    animation: backdropIn 180ms ease-out both;
  }

  .toast.show {
    animation: toastIn 240ms var(--motion-spring) both;
  }

  .bar i {
    transition: width 500ms var(--motion-spring);
  }

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

  @keyframes backdropIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

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

// Apenas marca visualmente o card enquanto o navegador está arrastando.
// Não altera DOM, coluna, ordem, estado ou contadores.
document.addEventListener('dragstart', (event) => {
  const card = event.target?.closest?.('.task-card');
  if (!card) return;
  card.classList.add('motion-dragging');
}, true);

document.addEventListener('dragend', (event) => {
  const card = event.target?.closest?.('.task-card');
  card?.classList.remove('motion-dragging');
  document.querySelectorAll('.task-card.motion-dragging').forEach((el) => {
    el.classList.remove('motion-dragging');
  });
}, true);

// Transição leve somente ao trocar de seção. Não observa cards do board.
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
