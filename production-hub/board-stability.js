import { supabaseConfig } from './supabase-config.js';

// Board sem HTML5 Drag and Drop.
// Pointer Events controlam somente a interação visual; Supabase persiste o status.

const projectRef = (() => {
  try { return new URL(supabaseConfig.url).hostname.split('.')[0]; }
  catch { return ''; }
})();

const authStorageKey = projectRef ? `sb-${projectRef}-auth-token` : '';

let pointerState = null;
let placeholder = null;
let activeZone = null;
let floatingCard = null;
let suppressClickUntil = 0;
let moveSequence = 0;
let taskCache = { projectId: '', at: 0, rows: [] };
const updateChains = new Map();

const boardStyle = document.createElement('style');
boardStyle.textContent = `
  .task-card {
    cursor: grab;
  }

  .task-card.board-pointer-source {
    opacity: .28 !important;
    animation: none !important;
    transform: none !important;
  }

  body.board-pointer-active,
  body.board-pointer-active * {
    cursor: grabbing !important;
    user-select: none !important;
  }

  .column.board-drop-target {
    border-color: rgba(95,99,242,.52) !important;
    background: rgba(95,99,242,.055) !important;
    box-shadow: inset 0 0 0 1px rgba(95,99,242,.10) !important;
  }

  .board-drop-placeholder {
    height: 88px;
    margin: 0 0 9px;
    border: 1.5px dashed rgba(95,99,242,.62);
    border-radius: 13px;
    background: rgba(95,99,242,.075);
    box-sizing: border-box;
    pointer-events: none;
  }

  .board-pointer-ghost {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    z-index: 99999 !important;
    margin: 0 !important;
    opacity: .96 !important;
    pointer-events: none !important;
    animation: none !important;
    transition: none !important;
    transform-origin: top left !important;
    box-shadow: 0 16px 36px rgba(25,35,55,.20) !important;
  }

  .task-card.board-saving {
    opacity: .94;
  }
`;
document.head.appendChild(boardStyle);

function getAccessToken() {
  const keys = authStorageKey
    ? [authStorageKey, ...Object.keys(localStorage).filter(k => k !== authStorageKey && /^sb-.*-auth-token$/.test(k))]
    : Object.keys(localStorage).filter(k => /^sb-.*-auth-token$/.test(k));

  for (const key of keys) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      if (value?.access_token) return value.access_token;
      if (value?.currentSession?.access_token) return value.currentSession.access_token;
    } catch {}
  }
  return '';
}

function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
}

function normalize(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function statusFromColumn(column) {
  if (!column) return '';
  const explicit = column.dataset.status || column.getAttribute('data-status');
  if (explicit) return String(explicit).toUpperCase();

  const text = (column.querySelector('.column-head')?.textContent || '').toUpperCase();
  if (text.includes('BACKLOG')) return 'BACKLOG';
  if (text.includes('FAZENDO')) return 'DOING';
  if (text.includes('REVIS')) return 'REVIEW';
  if (text.includes('FEITO')) return 'DONE';
  return '';
}

function directTaskId(card) {
  if (!card) return '';
  return [
    card.dataset.stableTaskId,
    card.dataset.taskId,
    card.dataset.id,
    card.getAttribute('data-task-id'),
    card.getAttribute('data-id'),
    card.querySelector('[data-task-id]')?.getAttribute('data-task-id'),
    card.querySelector('[data-id]')?.getAttribute('data-id'),
  ].find(Boolean) || '';
}

function currentProjectId() {
  return document.getElementById('taskProjectFilter')?.value || '';
}

async function getProjectTasks(projectId) {
  if (!projectId) return [];
  if (taskCache.projectId === projectId && Date.now() - taskCache.at < 2500) return taskCache.rows;

  const token = getAccessToken();
  if (!token) throw new Error('Sessão não encontrada. Recarregue a página.');

  const url = new URL(`${supabaseConfig.url}/rest/v1/tasks`);
  url.searchParams.set('select', 'id,project_id,title,status,module,updated_at');
  url.searchParams.set('project_id', `eq.${projectId}`);

  const response = await fetch(url, {
    headers: {
      apikey: supabaseConfig.publishableKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) throw new Error(`Falha ao carregar tarefas (${response.status})`);

  const rows = await response.json();
  taskCache = { projectId, at: Date.now(), rows };
  return rows;
}

async function resolveTask(card, sourceStatus) {
  const direct = directTaskId(card);
  if (direct) return { id: direct };

  const projectId = currentProjectId();
  const title = normalize(card?.querySelector('.task-title')?.textContent);
  const moduleText = normalize(card?.querySelector('.module')?.textContent);

  if (!projectId || !title) throw new Error('Não foi possível identificar a tarefa arrastada.');

  const rows = await getProjectTasks(projectId);
  let candidates = rows.filter(row => normalize(row.title) === title);

  if (sourceStatus) {
    const sameStatus = candidates.filter(row => row.status === sourceStatus);
    if (sameStatus.length) candidates = sameStatus;
  }

  if (moduleText) {
    const sameModule = candidates.filter(row => normalize(row.module) === moduleText);
    if (sameModule.length) candidates = sameModule;
  }

  if (!candidates.length) throw new Error('A tarefa não foi encontrada no projeto.');

  candidates.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return candidates[0];
}

async function patchStatus(taskId, status) {
  const token = getAccessToken();
  if (!token) throw new Error('Sessão não encontrada. Recarregue a página.');

  const url = new URL(`${supabaseConfig.url}/rest/v1/tasks`);
  url.searchParams.set('id', `eq.${taskId}`);

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: supabaseConfig.publishableKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Não foi possível mover a tarefa (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  taskCache.at = 0;
}

function enqueueUpdate(taskId, status) {
  const previous = updateChains.get(taskId) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => patchStatus(taskId, status))
    .finally(() => {
      if (updateChains.get(taskId) === next) updateChains.delete(taskId);
    });

  updateChains.set(taskId, next);
  return next;
}

function updateCount(zone) {
  const column = zone?.closest('.column');
  const bubble = column?.querySelector('.column-count');
  if (!bubble) return;
  const count = column.querySelectorAll('.dropzone > .task-card:not(.board-pointer-ghost)').length;
  const text = String(count);
  if (bubble.textContent !== text) bubble.textContent = text;
}

function clearPlaceholder() {
  placeholder?.remove();
  placeholder = null;
}

function clearTarget() {
  activeZone?.closest('.column')?.classList.remove('board-drop-target');
  activeZone = null;
}

function clearFloatingCard() {
  floatingCard?.remove();
  floatingCard = null;
}

function clearVisuals() {
  pointerState?.card?.classList.remove('board-pointer-source');
  document.body.classList.remove('board-pointer-active');
  clearPlaceholder();
  clearTarget();
  clearFloatingCard();
}

function cancelPointerInteraction() {
  const state = pointerState;
  pointerState = null;
  if (state?.card && state.pointerId != null) {
    try { state.card.releasePointerCapture?.(state.pointerId); } catch {}
  }
  clearVisuals();
}

function beginVisualDrag(state, clientX, clientY) {
  if (!state || state.dragging) return;
  state.dragging = true;
  state.card.classList.add('board-pointer-source');
  document.body.classList.add('board-pointer-active');

  const rect = state.card.getBoundingClientRect();
  floatingCard = state.card.cloneNode(true);
  floatingCard.classList.remove('board-pointer-source', 'board-saving', 'dragging');
  floatingCard.classList.add('board-pointer-ghost');
  floatingCard.removeAttribute('draggable');
  floatingCard.style.width = `${Math.round(rect.width)}px`;
  floatingCard.style.height = `${Math.round(rect.height)}px`;
  document.body.appendChild(floatingCard);

  state.offsetX = Math.min(Math.max(clientX - rect.left, 18), rect.width - 18);
  state.offsetY = Math.min(Math.max(clientY - rect.top, 14), rect.height - 14);
  moveFloatingCard(clientX, clientY);
}

function moveFloatingCard(clientX, clientY) {
  if (!floatingCard || !pointerState) return;
  const x = Math.round(clientX - (pointerState.offsetX || 24));
  const y = Math.round(clientY - (pointerState.offsetY || 20));
  floatingCard.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.01)`;
}

function zoneAtPoint(clientX, clientY) {
  const hit = document.elementFromPoint(clientX, clientY);
  return hit?.closest?.('.dropzone') || null;
}

function showTarget(zone) {
  if (!pointerState?.dragging) return;

  if (!zone) {
    clearPlaceholder();
    clearTarget();
    return;
  }

  if (activeZone !== zone) {
    clearTarget();
    activeZone = zone;
    zone.closest('.column')?.classList.add('board-drop-target');
  }

  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.className = 'board-drop-placeholder';
    const height = pointerState.card?.getBoundingClientRect().height || 88;
    placeholder.style.height = `${Math.max(72, Math.round(height))}px`;
  }

  if (placeholder.parentElement !== zone) zone.appendChild(placeholder);
}

function rollbackMove(state, movedZone, sequence) {
  const { card, sourceZone, sourceNextSibling } = state || {};
  if (!card || card.dataset.boardMoveSequence !== String(sequence)) return;
  if (!sourceZone?.isConnected) return;

  if (sourceNextSibling?.isConnected && sourceNextSibling.parentElement === sourceZone) {
    sourceZone.insertBefore(card, sourceNextSibling);
  } else {
    sourceZone.appendChild(card);
  }

  card.classList.remove('board-saving');
  updateCount(sourceZone);
  updateCount(movedZone);
}

async function finishMove(state, targetZone) {
  const card = state.card;
  const targetStatus = statusFromColumn(targetZone?.closest('.column'));

  if (!targetZone || !targetStatus || targetStatus === state.sourceStatus) return;

  const sourceZone = state.sourceZone;
  const sequence = ++moveSequence;
  card.dataset.boardMoveSequence = String(sequence);
  card.classList.remove('board-pointer-source');
  card.classList.add('board-saving');

  if (placeholder?.parentElement === targetZone) {
    targetZone.insertBefore(card, placeholder);
  } else {
    targetZone.appendChild(card);
  }

  updateCount(sourceZone);
  updateCount(targetZone);

  try {
    const task = await state.taskPromise;
    card.dataset.stableTaskId = task.id;
    await enqueueUpdate(task.id, targetStatus);

    if (card.dataset.boardMoveSequence === String(sequence)) {
      card.classList.remove('board-saving');
    }
  } catch (error) {
    console.error('[board-pointer]', error);
    rollbackMove(state, targetZone, sequence);
    toast(error?.message || 'Não foi possível mover a tarefa.');
  }
}

// Desativa totalmente o HTML5 Drag and Drop dos cards.
document.addEventListener('dragstart', event => {
  if (!event.target?.closest?.('.task-card')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

document.addEventListener('pointerdown', event => {
  if (event.button !== 0 || pointerState) return;

  const card = event.target?.closest?.('.task-card');
  if (!card || card.classList.contains('board-pointer-ghost')) return;
  if (event.target?.closest?.('button,a,input,select,textarea')) return;

  const sourceZone = card.closest('.dropzone');
  const sourceStatus = statusFromColumn(card.closest('.column'));
  if (!sourceZone || !sourceStatus) return;

  pointerState = {
    pointerId: event.pointerId,
    card,
    sourceZone,
    sourceStatus,
    sourceNextSibling: card.nextSibling,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
    taskPromise: resolveTask(card, sourceStatus),
  };

  try { card.setPointerCapture?.(event.pointerId); } catch {}
}, true);

document.addEventListener('pointermove', event => {
  const state = pointerState;
  if (!state || state.pointerId !== event.pointerId) return;

  if (!state.dragging) {
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if ((dx * dx) + (dy * dy) < 49) return;
    beginVisualDrag(state, event.clientX, event.clientY);
  }

  event.preventDefault();
  moveFloatingCard(event.clientX, event.clientY);
  showTarget(zoneAtPoint(event.clientX, event.clientY));
}, true);

document.addEventListener('pointerup', event => {
  const state = pointerState;
  if (!state || state.pointerId !== event.pointerId) return;

  pointerState = null;
  try { state.card.releasePointerCapture?.(event.pointerId); } catch {}

  if (!state.dragging) {
    clearVisuals();
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  suppressClickUntil = Date.now() + 350;

  const targetZone = activeZone || zoneAtPoint(event.clientX, event.clientY);
  // Move antes de limpar o placeholder para a resposta visual ser instantânea.
  const movePromise = finishMove(state, targetZone);
  clearVisuals();
  void movePromise;
}, true);

document.addEventListener('pointercancel', event => {
  if (!pointerState || pointerState.pointerId !== event.pointerId) return;
  cancelPointerInteraction();
}, true);

document.addEventListener('click', event => {
  if (Date.now() >= suppressClickUntil) return;
  if (!event.target?.closest?.('.task-card')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && pointerState) cancelPointerInteraction();
}, true);

window.addEventListener('blur', () => {
  if (pointerState) cancelPointerInteraction();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && pointerState) cancelPointerInteraction();
});

document.getElementById('taskProjectFilter')?.addEventListener('change', () => {
  taskCache = { projectId: '', at: 0, rows: [] };
  if (pointerState) cancelPointerInteraction();
});
