import { visibleHeight } from '@/lib/viewportWatch';

/**
 * Waar het gesprek scrolt. In het gesplitste scherm van de chat scrolt op een
 * breed scherm het paneel zelf (de pagina erin heeft een eigen scroller); op
 * de telefoon staan de panelen onder elkaar en scrolt het document. Deze helpers
 * zoeken het element dat echt scrolt, zodat de chat in beide standen hetzelfde
 * doet: een nieuwe vraag bovenaan, "Naar beneden", meelezen.
 */

/** De eerstvolgende voorouder die zelf scrolt, door shadow roots en slots heen; null is het document. */
export function scrollContainer(el: Element | null): HTMLElement | null {
  let node: Node | null = el;
  while (node) {
    const slot: Node | null = node instanceof Element ? node.assignedSlot : null;
    let next: Node | null = slot ?? node.parentNode;
    if (next instanceof ShadowRoot) next = next.host;
    node = next;
    if (!(node instanceof HTMLElement) || node === document.body || node === document.documentElement) continue;
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return node;
  }
  return null;
}

/** Het zichtbare deel van het gesprek en hoe je het verschuift. */
export function scrollArea(el: Element | null) {
  const box = scrollContainer(el);
  const docHeight = () => (document.scrollingElement ?? document.documentElement).scrollHeight;
  return {
    /** Het element om scroll-events op te luisteren. */
    target: (box ?? window) as HTMLElement | Window,
    /** Bovenkant van het zichtbare deel, in venstercoördinaten. */
    top: box ? box.getBoundingClientRect().top : 0,
    /** Hoogte van het zichtbare deel. */
    height: box ? box.clientHeight : visibleHeight(),
    scrollTop: box ? box.scrollTop : window.scrollY,
    scrollHeight: box ? box.scrollHeight : docHeight(),
    /** Onderkant van alle inhoud, in venstercoördinaten. */
    end: box
      ? box.getBoundingClientRect().top - box.scrollTop + box.scrollHeight
      : docHeight() - window.scrollY,
    scrollTo(top: number, behavior: ScrollBehavior = 'auto') {
      (box ?? window).scrollTo({ top, behavior });
    },
  };
}
