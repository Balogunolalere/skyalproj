// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { OptionFieldsBlock } from '@/components/skyal/OptionFieldsBlock'
import type { OptionField } from '@/lib/order'

/**
 * Interaction test: a dropdown with mixed choices
 * `[{ value: 'Gold', image }, 'Silver']` must render two choices, show a
 * thumbnail on the first, and clicking it must emit `{ colour: 'Gold' }` —
 * the plain string value, never the object.
 */

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function render(ui: ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(ui))
  return {
    container,
    rerender: (next: ReactNode) => act(() => root.render(next)),
    unmount: () => act(() => root.unmount()),
  }
}

const IMAGE_FIELD: OptionField = {
  key: 'colour',
  label: 'Colour',
  type: 'dropdown',
  required: true,
  choices: [{ value: 'Gold', image: 'https://x/g.png' }, 'Silver'],
}

describe('OptionFieldsBlock — image choice selection', () => {
  test('renders two choices, the first with an image, and selecting it emits { colour: "Gold" }', () => {
    const onChange = vi.fn()
    const { container, unmount } = render(
      <OptionFieldsBlock
        service={{ optionFields: [IMAGE_FIELD] }}
        values={{}}
        onChange={onChange}
        variant=""
        onVariantChange={() => {}}
      />,
    )

    // Two radio-style choices instead of a native select (images visible).
    const radios = container.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    expect(radios).toHaveLength(2)
    expect(container.querySelector('select')).toBeNull()

    // First choice is Gold and carries the thumbnail.
    expect(radios[0].textContent).toContain('Gold')
    const img = radios[0].querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe('https://x/g.png')

    // Second choice is the plain string 'Silver' — no thumbnail.
    expect(radios[1].textContent).toContain('Silver')
    expect(radios[1].querySelector('img')).toBeNull()

    // Selecting Gold emits the string value keyed by the field.
    act(() => {
      radios[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ colour: 'Gold' })

    unmount()
  })

  test('mixed choices normalize objects with or without images', () => {
    const onChange = vi.fn()
    const { container, unmount } = render(
      <OptionFieldsBlock
        service={{
          optionFields: [
            {
              key: 'material',
              label: 'Material',
              type: 'dropdown',
              choices: [{ value: 'Oak' }, { value: 'Walnut', image: 'https://x/w.png' }],
            },
          ],
        }}
        values={{}}
        onChange={onChange}
        variant=""
        onVariantChange={() => {}}
      />,
    )

    const radios = container.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    expect(radios).toHaveLength(2)
    expect(radios[0].querySelector('img')).toBeNull() // object without image → placeholder
    expect(radios[1].querySelector('img')?.getAttribute('src')).toBe('https://x/w.png')

    act(() => {
      radios[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(onChange).toHaveBeenCalledWith({ material: 'Walnut' })

    unmount()
  })
})
