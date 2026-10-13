import { act } from 'react'

/** Sets a React-controlled input's value the way a user typing would. */
export function type(el: Element | null, value: string): void {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    throw new Error('type(): not an input')
  }
  const proto = el instanceof HTMLInputElement ? HTMLInputElement : HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set
  act(() => {
    setter?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Presses a key on an element the way a keyboard would (keydown only). Returns the event. */
export function press(el: Element | null, key: string): KeyboardEvent {
  if (!el) throw new Error('press(): element not found')
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  act(() => void el.dispatchEvent(event))
  return event
}

export function click(el: Element | null): void {
  if (!(el instanceof HTMLElement)) throw new Error('click(): element not found')
  act(() => el.click())
}

export function submit(form: Element | null): void {
  if (!form) throw new Error('submit(): form not found')
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

/** The first button whose text contains `text`. */
export function buttonByText(root: ParentNode, text: string): HTMLButtonElement | null {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text))
  return found ?? null
}

/** The input inside the `<label>` whose text contains `label`. */
export function inputByLabel(root: ParentNode, label: string): HTMLInputElement | null {
  const found = [...root.querySelectorAll('label')].find((l) => l.textContent?.includes(label))
  return found?.querySelector('input') ?? null
}

/** Runs pending promise callbacks and effects. */
export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}
