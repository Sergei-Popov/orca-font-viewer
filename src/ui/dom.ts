// A small element builder: h('div', { class: 'x', onclick }, 'text', child).

type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>
type Child = Node | string | null | undefined | false

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue
    if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2), value)
    } else if (key === 'class') {
      element.className = String(value)
    } else if (value === true) {
      element.setAttribute(key, '')
    } else {
      element.setAttribute(key, String(value))
    }
  }
  append(element, children)
  return element
}

export function append(parent: Element, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    parent.append(typeof child === 'string' ? document.createTextNode(child) : child)
  }
}

/** An element whose content is trusted markup (our own icons). */
export function html<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs, markup: string): HTMLElementTagNameMap[K] {
  const element = h(tag, attrs)
  element.innerHTML = markup
  return element
}

/** Paints a range input's filled part. */
export function paintRange(input: HTMLInputElement): void {
  const min = Number(input.min)
  const max = Number(input.max)
  const value = Number(input.value)
  const fraction = max > min ? (value - min) / (max - min) : 0
  input.style.setProperty('--fill', `${Math.max(0, Math.min(1, fraction)) * 100}%`)
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

/** A short message at the bottom of the page. */
export function toast(text: string): void {
  let element = document.querySelector<HTMLElement>('.fv-toast')
  if (!element) {
    element = h('div', { class: 'fv-toast', role: 'status' })
    document.body.append(element)
  }
  element.textContent = text
  element.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => element?.classList.remove('show'), 1400)
}

/**
 * Copies text: the async clipboard first, then a selection with execCommand. Returns false when
 * neither worked, so the caller can select the text for the person to copy.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // The frame may not have clipboard-write: fall back to a selection.
  }
  const area = h('textarea', { 'aria-hidden': 'true' })
  area.value = text
  area.style.cssText = 'position:fixed;top:-1000px;opacity:0'
  document.body.append(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}

/** Selects the text of `element`, for a manual copy. */
export function selectText(element: Element): void {
  const range = document.createRange()
  range.selectNodeContents(element)
  const selection = getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}
