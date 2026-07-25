(() => {
  const GALLERY_SELECTOR = ".reference-gallery";
  const CARD_SELECTOR = ".reference-gallery .media-block";
  const MIN_BOARD_HEIGHT = 440;
  let highestZ = 10;
  let activeDrag = null;
  let setupFrame = 0;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function numberFrom(value, fallback = 0) {
    const parsed = Number.parseFloat(value || "");
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function isEditing(element) {
    return Boolean(element.closest(".block-editor.is-editing"));
  }

  function setCardPosition(card, x, y) {
    card.dataset.boardX = x.toFixed(1);
    card.dataset.boardY = y.toFixed(1);
    card.style.setProperty("--board-x", `${x}px`);
    card.style.setProperty("--board-y", `${y}px`);
  }

  function setCardZ(card, z) {
    card.dataset.boardZ = String(z);
    card.style.setProperty("--board-z", String(z));
  }

  function getCardPosition(card) {
    return {
      x: numberFrom(card.dataset.boardX),
      y: numberFrom(card.dataset.boardY),
    };
  }

  function persistGalleryChange(card) {
    const content = card.closest(".block-content");
    if (!content) return;

    try {
      content.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: null,
        }),
      );
    } catch {
      content.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function updateGalleryHeight(gallery) {
    const cards = Array.from(gallery.querySelectorAll(":scope > .media-block"));
    let requiredHeight = MIN_BOARD_HEIGHT;

    cards.forEach((card) => {
      const { y } = getCardPosition(card);
      requiredHeight = Math.max(requiredHeight, y + card.offsetHeight + 28);
    });

    gallery.style.minHeight = `${Math.ceil(requiredHeight)}px`;
  }

  function positionNewCards(gallery) {
    const cards = Array.from(gallery.querySelectorAll(":scope > .media-block"));
    const galleryWidth = gallery.clientWidth || 1;

    cards.forEach((card, index) => {
      const currentZ = numberFrom(card.dataset.boardZ, index + 1);
      highestZ = Math.max(highestZ, currentZ);
      setCardZ(card, currentZ);

      if (card.dataset.boardX != null && card.dataset.boardY != null) {
        const current = getCardPosition(card);
        const maxX = Math.max(0, galleryWidth - card.offsetWidth);
        setCardPosition(card, clamp(current.x, 0, maxX), Math.max(0, current.y));
        return;
      }

      const step = 30;
      const maxX = Math.max(0, galleryWidth - card.offsetWidth);
      const x = clamp((index * step) % Math.max(step, maxX || step), 0, maxX);
      const y = index * step;
      setCardPosition(card, x, y);
    });

    updateGalleryHeight(gallery);
  }

  function prepareImages(root = document) {
    root.querySelectorAll(`${GALLERY_SELECTOR} img`).forEach((image) => {
      image.draggable = false;
    });
  }

  function setupBoards() {
    setupFrame = 0;
    document.querySelectorAll(GALLERY_SELECTOR).forEach((gallery) => {
      positionNewCards(gallery);
      prepareImages(gallery);
    });
  }

  function scheduleSetup() {
    if (setupFrame) return;
    setupFrame = requestAnimationFrame(setupBoards);
  }

  function endDrag(save) {
    if (!activeDrag) return;

    const { card, gallery, move, end } = activeDrag;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    card.classList.remove("is-board-dragging");
    document.body.classList.remove("is-dragging-reference");

    if (save) {
      updateGalleryHeight(gallery);
      persistGalleryChange(card);
    }

    activeDrag = null;
  }

  document.addEventListener(
    "dragstart",
    (event) => {
      if (event.target instanceof HTMLImageElement && event.target.closest(GALLERY_SELECTOR)) {
        event.preventDefault();
      }
    },
    true,
  );

  document.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Element)) return;

    const card = event.target.closest(CARD_SELECTOR);
    if (!card || !isEditing(card)) return;

    const frame = event.target.closest(".media-frame");
    if (!frame || !card.contains(frame)) return;

    if (
      event.target.closest(
        ".image-resize-controls, .image-free-resize-handle, button, figcaption",
      )
    ) {
      return;
    }

    const gallery = card.closest(GALLERY_SELECTOR);
    if (!gallery) return;

    event.preventDefault();
    endDrag(false);

    const start = getCardPosition(card);
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    highestZ += 1;
    setCardZ(card, highestZ);
    card.classList.add("is-board-dragging");
    document.body.classList.add("is-dragging-reference");

    const move = (moveEvent) => {
      moveEvent.preventDefault();

      const proposedX = start.x + moveEvent.clientX - startClientX;
      const proposedY = start.y + moveEvent.clientY - startClientY;
      const maxX = Math.max(0, gallery.clientWidth - card.offsetWidth);
      const x = clamp(proposedX, 0, maxX);
      const y = Math.max(0, proposedY);

      setCardPosition(card, x, y);

      const requiredHeight = y + card.offsetHeight + 28;
      if (requiredHeight > gallery.clientHeight) {
        gallery.style.minHeight = `${Math.ceil(requiredHeight)}px`;
      }
    };

    const end = () => endDrag(true);
    activeDrag = { card, gallery, move, end };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  });

  window.addEventListener("resize", scheduleSetup);

  const observer = new MutationObserver(scheduleSetup);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-image-width", "data-image-x", "data-image-y"],
  });

  document.addEventListener(
    "load",
    (event) => {
      if (event.target instanceof HTMLImageElement && event.target.closest(GALLERY_SELECTOR)) {
        scheduleSetup();
      }
    },
    true,
  );

  scheduleSetup();
})();
