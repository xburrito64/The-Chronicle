/**
 * The ways of working the bar, side by side above the list.
 *
 *   Move    over a block, the way the bar has always worked: press it for
 *           its note, drag it to move it, drag an edge to stretch it. Over
 *           anything else, drag a box: every block it touches, on as many
 *           days as it reaches, is gathered up, to be moved, deleted or
 *           copied all at once.
 *   Snip    click a block to cut it in two where the line is.
 *
 * Each has a letter, and a number for its place in the row, so switching is
 * one key without looking — see TOOL_KEYS.
 */

export const TOOLS = ['move', 'snip']

/** The keys that pick each tool: its letter, then its place in the row. */
export const TOOL_KEYS = {
  move: ['v', '1'],
  snip: ['s', '2'],
}

/** Whether a tool draws boxes and gathers blocks up. */
export const selects = (tool) => tool === 'move'

const NAMES = { move: 'Move and select', snip: 'Snip' }

function ToolIcon({ tool }) {
  if (tool === 'snip') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <circle cx="4" cy="4.4" r="2.2" />
        <circle cx="4" cy="11.6" r="2.2" />
        <path d="M5.9 5.6 14.2 12.2M5.9 10.4 14.2 3.8" />
      </svg>
    )
  }
  if (tool === 'move') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.4" y="1.4" width="9.6" height="8.4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2.2 1.6" />
        <path d="M7.2 5.6v9.6l2.4-2.2 1.7 3.5 1.6-.8-1.7-3.5 3.3-.3z" fill="currentColor" strokeLinejoin="round" />
      </svg>
    )
  }
  return null
}

export default function Tools({ tool, onTool }) {
  return (
    <div className="tools" role="radiogroup" aria-label="Tool">
      {TOOLS.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={tool === t}
          className={tool === t ? 'on' : ''}
          onClick={() => onTool(t)}
          title={`${NAMES[t]} — ${TOOL_KEYS[t][0].toUpperCase()} or ${TOOL_KEYS[t][1]}`}
        >
          <ToolIcon tool={t} />
          <kbd>{TOOL_KEYS[t][0].toUpperCase()}</kbd>
        </button>
      ))}
    </div>
  )
}
