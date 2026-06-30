type DetailsPopoverOptions = {
  focusSelector?: string;
  surfaceSelector?: string;
};

type RegisteredPopover = {
  details: HTMLDetailsElement;
  options: DetailsPopoverOptions;
};

const registeredPopovers = new Set<RegisteredPopover>();

let globalHandlersWired = false;

const getOpenPopovers = () =>
  Array.from(registeredPopovers).filter(({ details }) => details.open);

const getBounds = ({ details, options }: RegisteredPopover): DOMRect[] => {
  const rects: DOMRect[] = [details.getBoundingClientRect()];
  if (options.surfaceSelector) {
    const surface = details.querySelector<HTMLElement>(options.surfaceSelector);
    if (surface) rects.push(surface.getBoundingClientRect());
  }
  return rects;
};

const wireGlobalHandlers = () => {
  if (globalHandlersWired || typeof document === 'undefined') return;
  globalHandlersWired = true;

  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Node | null;
    const { clientX: x, clientY: y } = e;

    getOpenPopovers().forEach((popover) => {
      if (target && popover.details.contains(target)) return;

      const inside = getBounds(popover).some(
        (rect) =>
          x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
      );
      if (inside) return;

      popover.details.open = false;
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    getOpenPopovers().forEach(({ details }) => {
      details.open = false;
      details.querySelector<HTMLElement>('summary')?.focus();
    });
  });
};

export const wireDetailsPopover = (
  details: HTMLDetailsElement,
  options: DetailsPopoverOptions = {},
) => {
  const registeredPopover: RegisteredPopover = { details, options };
  registeredPopovers.add(registeredPopover);
  wireGlobalHandlers();

  details.addEventListener('toggle', () => {
    if (!details.open) return;
    if (!options.focusSelector) return;
    details
      .querySelector<HTMLElement>(options.focusSelector)
      ?.focus({ preventScroll: true });
  });
};
