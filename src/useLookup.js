import { useEffect, useState } from 'react'

// Long enough that typing a name doesn't fire a search per letter, short
// enough that stopping feels like the results were already waiting.
const DEBOUNCE_MS = 320
// One letter matches everything and answers with noise.
const MIN_QUERY = 2

/**
 * A search box's answers, for the lookups that need a key (TMDB): what was
 * found, whether it is still looking, and whether there is a key at all.
 *
 * `search(query, signal)` answers { configured, results }. Asked once with
 * nothing typed so an empty box can say a key is missing rather than waiting
 * for someone to type into a search that was never going to answer. Every
 * search abandons the one before it, so the answer to half a word can never
 * land on top of the answer to the whole one.
 */
export function useLookup(search, query) {
  const [results, setResults] = useState([])
  const [state, setState] = useState('idle') // idle | searching | done | error
  const [configured, setConfigured] = useState(null) // null until asked
  const [problem, setProblem] = useState('')

  useEffect(() => {
    let alive = true
    search('', undefined)
      .then((body) => { if (alive) setConfigured(body.configured !== false) })
      .catch(() => { if (alive) setConfigured(true) }) // let a real search report it
    return () => { alive = false }
  }, [search])

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY) {
      setResults([])
      setState('idle')
      return undefined
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setState('searching')
      try {
        const body = await search(q, controller.signal)
        if (controller.signal.aborted) return
        setConfigured(body.configured !== false)
        setResults(body.results ?? [])
        setProblem('')
        setState('done')
      } catch (err) {
        if (controller.signal.aborted || err.name === 'AbortError') return
        setProblem(err.message)
        setState('error')
      }
    }, DEBOUNCE_MS)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, search])

  return { results, state, configured, problem, setProblem }
}
