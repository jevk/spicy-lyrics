const containerRects = new WeakMap<
  HTMLElement,
  { container: DOMRect; elements: Map<HTMLElement, DOMRect> }
>();

export default function ScrollIntoTopView(
  container: HTMLElement,
  element: HTMLElement,
  duration: number = 150, // Duration in milliseconds
  offset: number = 0, // Offset in pixels
  instantScroll: boolean = false // Instant scroll without animation
) {
  function resetContainerData(container: HTMLElement) {
    containerRects.delete(container);
  }

  // Observe changes in the container
  const observer = new MutationObserver(() => {
    resetContainerData(container);
  });

  observer.observe(container, { childList: true, subtree: true });

  // Handle container resize
  const resizeObserver = new ResizeObserver(() => {
    resetContainerData(container);
  });

  resizeObserver.observe(container);

  // Retrieve or initialize data for the container
  let containerData = containerRects.get(container);

  if (!containerData) {
    containerData = {
      container: container.getBoundingClientRect(),
      elements: new Map(),
    };
    containerRects.set(container, containerData);
  }

  const containerRect = containerData.container;

  // Fetch or calculate the bounding rect for the target element
  let elementRect = containerData.elements.get(element);
  if (!elementRect) {
    elementRect = element.getBoundingClientRect();
    containerData.elements.set(element, elementRect);
  }

  // Calculate the target scroll position with offset (keeping original top logic)
  const targetScrollTop = elementRect.top - containerRect.top + container.scrollTop - offset;

  const startScrollTop = container.scrollTop;
  const distance = targetScrollTop - startScrollTop;
  const startTime = performance.now();

  if (instantScroll) {
    container.classList.add("InstantScroll");
  }

  function smoothScroll(currentTime: number) {
    const elapsedTime = currentTime - startTime;
    const progress = Math.min(elapsedTime / duration, 1); // Progress between 0 and 1

    // Smooth cubic easing in-out
    const easing =
      progress < 0.5 ? 4 * progress * progress * progress : 1 - (-2 * progress + 2) ** 3 / 2;

    // Update container scroll position
    const newScrollTop = startScrollTop + distance * easing;
    container.scrollTop = newScrollTop;

    // Continue animation until complete
    if (progress < 1) {
      requestAnimationFrame(smoothScroll);
    } else if (instantScroll) {
      container.classList.remove("InstantScroll");
    }
  }

  requestAnimationFrame(smoothScroll);

  // Cleanup observers when scrolling is done
  setTimeout(() => {
    observer.disconnect();
    resizeObserver.disconnect();
    if (instantScroll && container.classList.contains("InstantScroll")) {
      container.classList.remove("InstantScroll");
    }
  }, duration);
}

/**
 * Helper to get element's offset relative to a container without getBoundingClientRect()
 * Uses offsetTop which doesn't trigger forced reflow
 */
function getOffsetTopRelativeToContainer(element: HTMLElement, container: HTMLElement): number {
  let offset = 0;
  let current: HTMLElement | null = element;
  
  while (current && current !== container && container.contains(current)) {
    offset += current.offsetTop;
    const parent = current.offsetParent as HTMLElement | null;
    // If offsetParent is null or is the container, stop
    if (!parent || parent === container) break;
    current = parent;
  }
  
  return offset;
}

/**
 * A simpler version of ScrollIntoTopView that uses CSS for smooth scrolling
 * This function relies on the CSS scroll-behavior: smooth property
 * @param container The container element to scroll
 * @param element The element to scroll to
 * @param offset Vertical offset in pixels (negative values move the element up)
 * @param instantScroll Whether to use instant scrolling (no animation)
 */
export function ScrollIntoTopViewCSS(
  container: HTMLElement,
  element: HTMLElement,
  offset: number = 0,
  instantScroll: boolean = false
) {
  // Calculate target position using offsetTop (avoids getBoundingClientRect reflow)
  const elementOffsetTop = getOffsetTopRelativeToContainer(element, container);

  const targetScrollTop = elementOffsetTop - offset;

  // Toggle instant scroll mode if needed
  if (instantScroll) {
    container.classList.add("InstantScroll");
  }

  // Let CSS handle the smooth scrolling
  container.scrollTop = targetScrollTop;

  // Remove the instant scroll class after a short delay
  if (instantScroll) {
    setTimeout(() => {
      container.classList.remove("InstantScroll");
    }, 50); // Small delay to allow the scroll to happen
  }
}
