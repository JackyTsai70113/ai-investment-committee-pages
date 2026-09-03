export function installTabNavigation(root, { onActivate } = {}) {
  const controls = root.querySelector("[data-tab-controls]");
  const menuToggle = controls?.querySelector("[data-tab-menu-toggle]");
  const strip = controls?.querySelector("[data-tab-strip]");
  const triggers = [...root.querySelectorAll("[data-tab-trigger]")];
  const panels = [...root.querySelectorAll("[role=tabpanel][data-tab-panel]")];
  if (!controls || triggers.length === 0 || panels.length === 0) {
    panels.forEach((panel) => { panel.hidden = false; });
    return;
  }

  const setTab = (target, { focus = false, preserveScroll = false } = {}) => {
    const compactNavigation = window.matchMedia("(max-width: 640px)").matches;
    triggers.forEach((trigger) => {
      const isActive = trigger.dataset.tabTarget === target;
      trigger.classList.toggle("active", isActive);
      trigger.setAttribute("aria-selected", String(isActive));
      trigger.tabIndex = isActive ? 0 : -1;
    });
    panels.forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== target; });
    strip?.classList.remove("is-open");
    menuToggle?.setAttribute("aria-expanded", "false");
    if ((focus || compactNavigation) && !preserveScroll) {
      const targetPanel = panels.find((panel) => panel.dataset.tabPanel === target);
      if (compactNavigation && targetPanel) {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        targetPanel.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
        targetPanel.focus();
      } else {
        triggers.find((trigger) => trigger.dataset.tabTarget === target)?.focus();
      }
    }
    onActivate?.(target);
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => setTab(trigger.dataset.tabTarget));
    trigger.addEventListener("keydown", (event) => {
      const currentIndex = triggers.indexOf(trigger);
      const nextIndex = event.key === "ArrowRight" ? (currentIndex + 1) % triggers.length
        : event.key === "ArrowLeft" ? (currentIndex - 1 + triggers.length) % triggers.length
          : event.key === "Home" ? 0 : event.key === "End" ? triggers.length - 1 : null;
      if (nextIndex !== null) { event.preventDefault(); setTab(triggers[nextIndex].dataset.tabTarget, { focus: true }); }
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); setTab(trigger.dataset.tabTarget, { focus: true }); }
    });
  });
  menuToggle?.addEventListener("click", () => {
    const shouldOpen = !strip.classList.contains("is-open");
    strip.classList.toggle("is-open", shouldOpen);
    menuToggle.setAttribute("aria-expanded", String(shouldOpen));
  });
  controls.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && strip?.classList.contains("is-open")) {
      event.preventDefault(); strip.classList.remove("is-open"); menuToggle?.setAttribute("aria-expanded", "false"); menuToggle?.focus();
    }
  });
  root.querySelectorAll("[data-tab]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = link.getAttribute("data-tab");
      if (!target) return;
      event.preventDefault(); setTab(target);
      const glossaryId = link.getAttribute("href")?.split("#")[1];
      const targetSection = glossaryId && root.querySelector(`#${CSS.escape(glossaryId)}`);
      if (targetSection) targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
      else if (glossaryId) location.hash = `#${glossaryId}`;
    });
  });
  setTab(root.querySelector("[data-tab-trigger].active")?.dataset.tabTarget || "overview", {
    preserveScroll: true,
  });
}
