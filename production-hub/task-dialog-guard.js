// Edicao de tarefa explicita.
// Clicar no corpo do card nunca abre o modal. Apenas o botao "Editar card" autoriza a edicao.

let authorizedCard = null;
let allowEditDialogUntil = 0;

const editStyle = document.createElement('style');
editStyle.textContent = `
  .task-card {
    position: relative;
  }

  .task-card .edit-card-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 10px;
    padding: 6px 9px;
    border: 1px solid #e0e3ea;
    border-radius: 8px;
    background: #f8f9fb;
    color: #626977;
    font: inherit;
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer !important;
    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
  }

  .task-card .edit-card-btn:hover {
    background: #f0f1f6;
    border-color: #d3d7e0;
    color: #454b57;
  }

  body.board-pointer-active .task-card .edit-card-btn {
    pointer-events: none;
  }
`;
document.head.appendChild(editStyle);

function taskDialog() {
  return document.getElementById('taskDialog');
}

function closeTaskDialog() {
  const dialog = taskDialog();
  if (!dialog?.open) return;
  try { dialog.close(); }
  catch { dialog.removeAttribute('open'); }
}

function enhanceCards(root = document) {
  root.querySelectorAll?.('.task-card:not([data-edit-control-ready])').forEach(card => {
    card.dataset.editControlReady = '1';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'edit-card-btn';
    button.textContent = 'Editar card';
    button.setAttribute('aria-label', 'Editar card');
    card.appendChild(button);
  });
}

function openCardEditor(card) {
  if (!card?.isConnected) return;

  // O app original já sabe preencher e abrir o modal. Reutilizamos essa lógica,
  // mas somente por meio de um clique sintético explicitamente autorizado.
  authorizedCard = card;
  allowEditDialogUntil = performance.now() + 1500;

  try {
    card.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
  } finally {
    authorizedCard = null;
  }
}

// O card pode ser redesenhado pelo realtime a qualquer momento.
const board = document.getElementById('taskBoard');
if (board) {
  enhanceCards(board);
  const boardObserver = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.task-card')) enhanceCards(node.parentElement || board);
        else if (node.querySelector?.('.task-card')) enhanceCards(node);
      }
    }
  });
  boardObserver.observe(board, { childList: true, subtree: true });
}

// Regra principal: nenhum clique comum em card chega à lógica antiga de edição.
window.addEventListener('click', event => {
  const card = event.target?.closest?.('.task-card');
  if (!card) return;

  const editButton = event.target?.closest?.('.edit-card-btn');

  if (editButton) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openCardEditor(card);
    return;
  }

  // Este é o clique sintético disparado por openCardEditor.
  if (authorizedCard === card) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}, true);

// Ao entrar no Hub, nunca restaurar uma edição antiga.
closeTaskDialog();
queueMicrotask(closeTaskDialog);
window.addEventListener('pageshow', () => {
  allowEditDialogUntil = 0;
  closeTaskDialog();
  setTimeout(closeTaskDialog, 50);
}, true);

// Se alguma lógica antiga tentar abrir "Editar tarefa" sem passar pelo botão,
// fecha imediatamente. "Nova tarefa" continua funcionando normalmente.
const dialog = taskDialog();
if (dialog) {
  const dialogObserver = new MutationObserver(() => {
    queueMicrotask(() => {
      if (!dialog.open) return;
      const title = (document.getElementById('taskDialogTitle')?.textContent || '').trim().toLowerCase();
      const isEdit = title.includes('editar');
      if (isEdit && performance.now() > allowEditDialogUntil) closeTaskDialog();
    });
  });
  dialogObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });
}
