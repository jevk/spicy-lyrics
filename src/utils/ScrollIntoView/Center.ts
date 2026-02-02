const containerRects = new WeakMap<
  HTMLElement,
  { container: DOMRect; elements: Map<HTMLElement, DOMRect> }
>();

export default function ScrollIntoCenterView(
  container: HTMLElement,
  element: HTMLElement,
  duration: number = 800, // Increased duration for smoother scrolling
  offset: number = 0, // Offset in pixels, defaults to 0
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

  // Calculate the target scroll position with the offset
  const targetScrollTop =
    elementRect.top -
    containerRect.top +
    container.scrollTop -
    (container.clientHeight / 2 - element.clientHeight / 2) -
    offset; // Apply the offset

  const startScrollTop = container.scrollTop;
  const distance = targetScrollTop - startScrollTop;
  const startTime = performance.now();

  if (instantScroll) {
    container.classList.add("InstantScroll");
  }

  function smoothScroll(currentTime: number) {
    const elapsedTime = currentTime - startTime;
    const progress = Math.min(elapsedTime / duration, 1); // Progress between 0 and 1

    // Enhanced easing function for more natural movement
    // This provides a slight bounce effect at the end
    let easing: number;
    if (progress < 0.4) {
      // Slow start (ease-in)
      easing = 2.5 * progress ** 2;
    } else if (progress < 0.65) {
      // Speed up in the middle
      easing = 0.7 + (progress - 0.4) * 1.2;
    } else if (progress < 0.85) {
      // Slight overshoot
      easing = 1.0 + (progress - 0.65) * 0.15;
    } else {
      // Settle back (slight bounce)
      easing = 1.03 - (progress - 0.85) * 0.2;
    }

    const newScrollTop = startScrollTop + distance * easing;

    container.scrollTop = newScrollTop;

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
 * A simpler version of ScrollIntoCenterView that uses CSS for smooth scrolling
 * This function relies on the CSS scroll-behavior: smooth property
 * @param container The container element to scroll
 * @param element The element to scroll to
 * @param offset Vertical offset in pixels (negative values move the element up)
 * @param instantScroll Whether to use instant scrolling (no animation)
 */
export function ScrollIntoCenterViewCSS(
  container: HTMLElement,
  element: HTMLElement,
  offset: number = 0,
  instantScroll: boolean = false
) {
  // Calculate target position using offsetTop (avoids getBoundingClientRect reflow)
  const elementOffsetTop = getOffsetTopRelativeToContainer(element, container);
  const elementHeight = element.offsetHeight;
  const containerHeight = container.clientHeight;

  const targetScrollTop =
    elementOffsetTop -
    (containerHeight / 2 - elementHeight / 2) -
    offset;

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
    }, 50);
  }
}
