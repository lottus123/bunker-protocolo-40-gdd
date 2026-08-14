// Ajustes visuais globais do Production Hub.
// Mantido separado da lógica principal para facilitar refinamentos de UI.

const polishStyle = document.createElement('style');
polishStyle.textContent = `
  /* Badges não devem esticar junto com o conteúdo do card. */
  .project-top,
  .resource-top {
    align-items: flex-start !important;
  }

  .badge,
  .project-top > .badge,
  .resource-top > .badge {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    align-self: flex-start !important;
    flex: 0 0 auto !important;
    width: auto !important;
    height: auto !important;
    min-height: 26px;
    padding: 6px 9px !important;
    line-height: 1 !important;
    white-space: nowrap !important;
    text-align: center;
  }

  /* Mantém título, descrição e status visualmente alinhados no topo. */
  .project-top > :first-child,
  .resource-top > :first-child {
    min-width: 0;
  }

  .project-name,
  .resource h3 {
    line-height: 1.25;
  }

  /* Estatísticas com ritmo horizontal consistente. */
  .project-stats {
    align-items: flex-start;
  }

  .project-stats .stat {
    min-width: 34px;
  }
`;
document.head.appendChild(polishStyle);

const ignoredTags = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);

function cleanDashText(root = document.body) {
  if (!root) return;

  const cleanNode = (node) => {
    const parent = node.parentElement;
    if (!parent || ignoredTags.has(parent.tagName)) return;
    const value = node.nodeValue || '';
    if (!/[—–]/.test(value)) return;

    // Remove travessões/en dashes apenas de textos visíveis da interface.
    // Ex.: "GDD — Projeto" vira "GDD Projeto".
    node.nodeValue = value
      .replace(/\s*[—–]\s*/g, ' ')
      .replace(/\s{2,}/g, ' ');
  };

  if (root.nodeType === Node.TEXT_NODE) {
    cleanNode(root);
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current;
  while ((current = walker.nextNode())) cleanNode(current);
}

cleanDashText();

const textObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'characterData') {
      cleanDashText(mutation.target);
      continue;
    }

    for (const node of mutation.addedNodes) {
      cleanDashText(node);
    }
  }
});

if (document.body) {
  textObserver.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
}
