import { supabaseConfig } from './supabase-config.js';

// Board estavel: um unico sistema controla drag, feedback visual e persistencia.
// O card real e movido no DOM imediatamente; o Supabase continua sendo a fonte de verdade.

const projectRef = (() => {
  try { return new URL(supabaseConfig.url).hostname.split('.')[0]; }
  catch { return ''; }
})();
const authStorageKey = projectRef ? `sb-${projectRef}-auth-token` : '';

let dragContext = null;
let placeholder = null;
let dragGhost = null;
let activeZone = null;
let taskCache = { projectId: '', at: 0, rows: [] };
const updateChains = new Map();
const pendingMoves = new Map();

const boardStyle = document.createElement('style');
boardStyle.textContent = `
  .task-card.board-drag-source {
    opacity: .22 !important;
    transform: none !important;
    animation: none !important;
  }

  .column.board-drop-target {
    border-color: rgba(95,99,242,.48) !important;
    background: #f0f0fb !important;
    box-shadow: inset 0 0 0 1px rgba(95,99,242,.10) !important;
  }

  .dropzone.board-drop-target {
    background: rgba(95,99,242,.035) !important;
  }

  .board-drop-placeholder {
    margin: 0 0 9px;
    border: 1.5px dashed rgba(95,99,242,.55);
    border-radius: 13px;
    background: rgba(95,99,242,.07);
    pointer-events: none;
    box-sizing: border-box;
  }

  .task-card.board-pending {
    animation: none !important;
    transform: none !important;
  }

  .board-drag-ghost {
    position: fixed !important;
    left: -10000px !important;
    top: -10000px !important;
    z-index: -1 !important;
    margin: 0 !important;
    opacity: .97 !important;
    transform: rotate(.6deg) scale(1.01) !important;
    box-shadow: 0 14px 34px rgba(25,35,55,.20) !important;
    pointer-events: none !important;
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

function findZoneByStatus(status) {
  return [...document.querySelectorAll('.column')]
    .find(column => statusFromColumn(column) === status)
    ?.querySelector('.dropzone') || null;
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

function cardFingerprint(card) {
  return {
    title: normalize(card?.querySelector('.task-title')?.textContent),
    module: normalize(card?.querySelector('.module')?.textContent),
  };
}

function cardMatches(card, move) {
  if (!card || card.classList.contains('board-drag-ghost')) return false;
  const direct = directTaskId(card);
  if (move.taskId && direct && direct === move.taskId) return true;
  const current = cardFingerprint(card);
  if (!current.title || current.title !== move.fingerprint.title) return false;
  if (move.fingerprint.module && current.module && current.module !== move.fingerprint.module) return false;
  return true;
}

async function getProjectTasks(projectId) {
  if (!projectId) return [];
  if (taskCache.projectId === projectId && Date.now() - taskCache.at < 2500) return taskCache.rows;

  const token = getAccessToken();
  if (!token) throw new Error('Sessão não encontrada. Recarregue a página.');

  const url = new URL(`${supabaseConfig.url}/rest/v1/tasks`);
  url.searchParams.set('select', 'id,project_id,title,status,module,deadline,owner_id,updated_at');
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
    const byStatus = candidates.filter(row => row.status === sourceStatus);
    if (byStatus.length) candidates = byStatus;
  }

  if (moduleText) {
    const byModule = candidates.filter(row => normalize(row.module) === moduleText);
    if (byModule.length) candidates = byModule;
  }

  if (!candidates.length) throw new Error('A tarefa não foi encontrada no projeto.');
  if (candidates.length > 1) {
    candidates.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  }

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

  if (taskCache.rows.length) {
    const row = taskCache.rows.find(item => item.id === taskId);
    if (row) {
      row.status = status;
      row.updated_at = new Date().toISOString();
    }
  }
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

function refreshColumnCounts() {
  document.querySelectorAll('.column').forEach(column => {
    const count = column.querySelectorAll('.dropzone > .task-card:not(.board-drag-ghost)').length;
    const bubble = column.querySelector('.column-count');
    if (bubble) bubble.textContent = String(count);
  });
}

function clearPlaceholder() {
  placeholder?.remove();
  placeholder = null;
}

function clearTarget() {
  activeZone?.classList.remove('board-drop-target');
  activeZone?.closest('.column')?.classList.remove('board-drop-target');
  activeZone = null;
}

function clearGhost() {
  dragGhost?.remove();
  dragGhost = null;
}

function cleanupDragVisuals() {
  dragContext?.card?.classList.remove('board-drag-source', 'dragging');
  document.querySelectorAll('.task-card.board-drag-source').forEach(card => card.classList.remove('board-drag-source', 'dragging'));
  clearPlaceholder();
  clearTarget();
  clearGhost();
}

function ensurePlaceholder(card) {
  if (placeholder) return placeholder;
  placeholder = document.createElement('div');
  placeholder.className = 'board-drop-placeholder';
  const height = card?.getBoundingClientRect().height || 86;
  placeholder.style.height = `${Math.max(72, Math.round(height))}px`;
  return placeholder;
}

function findInsertionPoint(zone, clientY) {
  const cards = [...zone.querySelectorAll(':scope > .task-card')]
    .filter(card => card !== dragContext?.card && !card.classList.contains('board-drag-ghost'));

  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return card;
  }
  return null;
}

function showDropFeedback(zone, clientY) {
  if (!zone || !dragContext) return;

  if (activeZone !== zone) {
    clearTarget();
    activeZone = zone;
    activeZone.classList.add('board-drop-target');
    activeZone.closest('.column')?.classList.add('board-drop-target');
  }

  const marker = ensurePlaceholder(dragContext.card);
  const before = findInsertionPoint(zone, clientY);
  if (before) zone.insertBefore(marker, before);
  else zone.appendChild(marker);
}

function moveCardImmediately(card, zone) {
  if (!card || !zone) return;
  const before = placeholder?.parentElement === zone ? placeholder.nextSibling : null;
  card.classList.remove('board-drag-source', 'dragging');
  card.classList.add('board-pending');
  if (before && before !== card) zone.insertBefore(card, before);
  else zone.appendChild(card);
  clearPlaceholder();
  refreshColumnCounts();
}

function rollbackCard(context) {
  const { card, sourceZone, sourceNextSibling } = context || {};
  if (!card || !sourceZone?.isConnected) return;
  card.classList.remove('board-pending', 'board-drag-source', 'dragging');
  if (sourceNextSibling?.isConnected && sourceNextSibling.parentElement === sourceZone) {
    sourceZone.insertBefore(card, sourceNextSibling);
  } else {
    sourceZone.appendChild(card);
  }
  refreshColumnCounts();
}

function reconcilePendingMoves() {
  if (!pendingMoves.size) return;

  for (const move of pendingMoves.values()) {
    const targetZone = findZoneByStatus(move.targetStatus);
    if (!targetZone) continue;

    const matches = [...document.querySelectorAll('.task-card')].filter(card => cardMatches(card, move));
    if (!matches.length) continue;

    const chosen = matches.find(card => card.closest('.dropzone') === targetZone) || matches[0];
    chosen.classList.remove('dragging', 'board-drag-source');
    chosen.classList.add('board-pending');
    if (move.taskId) chosen.dataset.stableTaskId = move.taskId;

    for (const card of matches) {
      if (card !== chosen) card.remove();
    }

    if (chosen.closest('.dropzone') !== targetZone) targetZone.appendChild(chosen);
  }

  refreshColumnCounts();
}

const taskBoard = document.getElementById('taskBoard');
if (taskBoard) {
  const observer = new MutationObserver(() => queueMicrotask(reconcilePendingMoves));
  observer.observe(taskBoard, { childList: true, subtree: true });
}

document.addEventListener('dragstart', event => {
  const card = event.target?.closest?.('.task-card');
  if (!card || card.classList.contains('board-drag-ghost')) return;

  event.stopImmediatePropagation();
  cleanupDragVisuals();

  const sourceZone = card.closest('.dropzone');
  const sourceStatus = statusFromColumn(card.closest('.column'));
  dragContext = {
    card,
    sourceZone,
    sourceStatus,
    sourceNextSibling: card.nextSibling,
    fingerprint: cardFingerprint(card),
    taskPromise: resolveTask(card, sourceStatus),
  };

  dragContext.taskPromise.then(task => {
    card.dataset.stableTaskId = task.id;
  }).catch(() => {});

  card.classList.add('board-drag-source');

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', 'task'); } catch {}

    dragGhost = card.cloneNode(true);
    dragGhost.classList.remove('dragging', 'board-drag-source', 'board-pending');
    dragGhost.classList.add('board-drag-ghost');
    const rect = card.getBoundingClientRect();
    dragGhost.style.width = `${Math.round(rect.width)}px`;
    document.body.appendChild(dragGhost);
    event.dataTransfer.setDragImage(dragGhost, Math.min(Math.round(rect.width / 2), 80), 24);
  }
}, true);

document.addEventListener('dragover', event => {
  if (!dragContext) return;
  const zone = event.target?.closest?.('.dropzone');
  if (!zone) {
    clearPlaceholder();
    clearTarget();
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  showDropFeedback(zone, event.clientY);
}, true);

document.addEventListener('drop', async event => {
  if (!dragContext) return;
  const zone = event.target?.closest?.('.dropzone');
  if (!zone) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const context = dragContext;
  const targetStatus = statusFromColumn(zone.closest('.column'));
  dragContext = null;

  clearTarget();
  clearGhost();

  if (!targetStatus || targetStatus === context.sourceStatus) {
    context.card.classList.remove('board-drag-source', 'dragging');
    clearPlaceholder();
    return;
  }

  // O mesmo card real aparece na coluna nova imediatamente.
  moveCardImmediately(context.card, zone);

  try {
    const task = await context.taskPromise;
    context.card.dataset.stableTaskId = task.id;

    const seq = (pendingMoves.get(task.id)?.seq || 0) + 1;
    const move = {
      taskId: task.id,
      fingerprint: context.fingerprint,
      targetStatus,
      seq,
    };
    pendingMoves.set(task.id, move);
    reconcilePendingMoves();

    await enqueueUpdate(task.id, targetStatus);

    setTimeout(() => {
      const current = pendingMoves.get(task.id);
      if (!current || current.seq !== seq) return;
      pendingMoves.delete(task.id);
      const card = [...document.querySelectorAll('.task-card')].find(item => cardMatches(item, move));
      card?.classList.remove('board-pending');
      refreshColumnCounts();
    }, 1400);
  } catch (error) {
    console.error('[board-stability]', error);
    rollbackCard(context);
    toast(error?.message || 'Não foi possível mover a tarefa.');
  }
}, true);

document.addEventListener('dragend', event => {
  if (dragContext) {
    event.stopImmediatePropagation();
    dragContext.card?.classList.remove('board-drag-source', 'dragging');
  }
  dragContext = null;
  clearPlaceholder();
  clearTarget();
  clearGhost();
}, true);

document.getElementById('taskProjectFilter')?.addEventListener('change', () => {
  taskCache = { projectId: '', at: 0, rows: [] };
  pendingMoves.clear();
  cleanupDragVisuals();
});
