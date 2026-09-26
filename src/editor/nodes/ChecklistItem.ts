import { TaskItem } from '@tiptap/extension-list'
import { getRenderedAttributes } from '@tiptap/react'

// Keeps the checkbox's text label for screen readers without showing it.
const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'

/**
 * A checklist item whose box can be ticked without taking over the editor.
 *
 * The stock item focuses the editor on every tick. That puts the cursor back wherever it
 * was last (often the end of the list) and, on a phone, raises the keyboard, so the screen
 * jumped away from the item you were ticking. Ticking is only a change to the item, so this
 * version leaves focus, cursor and scroll position alone. It is otherwise the stock item
 * (same document format, same typing shortcuts).
 */
export const ChecklistItem = TaskItem.extend({
  addNodeView() {
    return ({ node, HTMLAttributes, getPos, editor }) => {
      const listItem = document.createElement('li')
      const checkboxWrapper = document.createElement('label')
      const checkboxStyler = document.createElement('span')
      const checkbox = document.createElement('input')
      const content = document.createElement('div')
      checkboxStyler.style.cssText = VISUALLY_HIDDEN

      const updateLabel = (current: typeof node) => {
        const label =
          this.options.a11y?.checkboxLabel?.(current, current.attrs.checked) ||
          `Task item checkbox for ${current.textContent || 'empty task item'}`
        checkbox.setAttribute('aria-label', label)
        checkboxStyler.textContent = label
      }
      updateLabel(node)

      checkboxWrapper.contentEditable = 'false'
      checkbox.type = 'checkbox'
      checkbox.addEventListener('mousedown', (event) => event.preventDefault())
      checkbox.addEventListener('change', (event) => {
        const checked = (event.target as HTMLInputElement).checked
        const position = typeof getPos === 'function' ? getPos() : undefined
        if (!editor.isEditable || typeof position !== 'number') {
          checkbox.checked = !checked // cannot change it: put the box back
          return
        }
        const current = editor.state.doc.nodeAt(position)
        if (!current) return
        // Straight to the document: no focus(), so the cursor, the scroll position and the
        // on-screen keyboard are all left as they were.
        editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...current.attrs, checked }))
      })

      for (const [key, value] of Object.entries(this.options.HTMLAttributes)) listItem.setAttribute(key, value as string)
      listItem.dataset.checked = node.attrs.checked
      checkbox.checked = node.attrs.checked
      checkboxWrapper.append(checkbox, checkboxStyler)
      listItem.append(checkboxWrapper, content)
      for (const [key, value] of Object.entries(HTMLAttributes)) listItem.setAttribute(key, value as string)

      let renderedKeys = new Set(Object.keys(HTMLAttributes))
      return {
        dom: listItem,
        contentDOM: content,
        update: (updated) => {
          if (updated.type !== this.type) return false
          listItem.dataset.checked = updated.attrs.checked
          checkbox.checked = updated.attrs.checked
          updateLabel(updated)
          const fresh = getRenderedAttributes(updated, editor.extensionManager.attributes)
          const freshKeys = new Set(Object.keys(fresh))
          const fixed = this.options.HTMLAttributes as Record<string, string>
          for (const key of renderedKeys) {
            if (freshKeys.has(key)) continue
            if (key in fixed) listItem.setAttribute(key, fixed[key])
            else listItem.removeAttribute(key)
          }
          for (const [key, value] of Object.entries(fresh)) {
            if (value === null || value === undefined) {
              if (key in fixed) listItem.setAttribute(key, fixed[key])
              else listItem.removeAttribute(key)
            } else listItem.setAttribute(key, value as string)
          }
          renderedKeys = freshKeys
          return true
        },
      }
    }
  },
})
