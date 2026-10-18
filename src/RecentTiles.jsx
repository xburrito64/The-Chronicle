import { coverUrl } from './api.js'
import { todayISO, shiftDate, weekdayOf, formatShortDate } from './time.js'

/**
 * What was watched lately, offered before anything is typed: under the same
 * rule as the unwritten card, two by two, each a small cover, its name and a
 * line saying where you got to and when. Most evenings are the next episode
 * of something already on the go.
 *
 * `items` are [{ key, name, cover, meta, title }], `cover` a kept file or ''.
 * The cursor is the search box's own, so the arrows and Enter work these too.
 */
export default function RecentTiles({ items, cursor, setCursor, onPick, blank = '🌸' }) {
  return (
    <div className="recentshows">
      <span className="gamerule" aria-hidden="true"><i /></span>
      <ul className="recentlist">
        {items.map((item, i) => (
          <li key={item.key}>
            <button
              type="button"
              className={`recentshow${i === cursor ? ' on' : ''}`}
              title={item.title}
              onMouseEnter={() => setCursor(i)}
              onClick={() => onPick(item, i)}
            >
              {item.cover
                ? <img className="recentshot" src={coverUrl(item.cover)} alt="" loading="lazy" />
                : <span className="recentshot none" aria-hidden="true">{blank}</span>}
              <span className="recentbody">
                <span className="recentname">{item.name}</span>
                <span className="recentwhen">{item.meta}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** When something was last on, the way you would say it. */
export function whenOf(date) {
  if (!date) return ''
  const today = todayISO()
  if (date === today) return 'today'
  if (date === shiftDate(today, -1)) return 'yesterday'
  return `${weekdayOf(date)} ${formatShortDate(date)}`
}
