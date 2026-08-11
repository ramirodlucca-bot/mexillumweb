import { animate, inView, stagger } from "motion";

export function initReveal(): void {
  inView(
    "[data-reveal]",
    (element) => {
      animate(
        element,
        { opacity: [0, 1], transform: ["translateY(14px)", "translateY(0)"] },
        { duration: 0.6, easing: "ease-out" },
      );
    },
    { amount: 0.3 },
  );

  document.querySelectorAll<HTMLElement>("[data-reveal-group]").forEach((group) => {
    inView(
      group,
      () => {
        const items = group.querySelectorAll<HTMLElement>("[data-reveal-item]");
        animate(
          items,
          { opacity: [0, 1], transform: ["translateY(14px)", "translateY(0)"] },
          { duration: 0.5, easing: "ease-out", delay: stagger(0.08) },
        );
      },
      { amount: 0.2 },
    );
  });
}
