import { useCallback, useEffect, useRef, useState } from 'react'

const API = '/api'

// Shared, multi-user state. Every mutation is optimistic locally and then
// re-synced from the server, while a slow poll picks up other people's edits.
// Polling pauses while a write is in flight so a stale read can't undo what
// the user just did.

async function post(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    let msg = `HTTP ${r.status}`
    try { msg = (await r.json()).error || msg } catch {}
    throw new Error(msg)
  }
  return r.json()
}

export function useTripState() {
  const [state, setState] = useState(null)
  const [status, setStatus] = useState('ok') // ok | saving | err
  const [error, setError] = useState(null)
  const inflight = useRef(0)
  const [me, setMe] = useState(() => localStorage.getItem('rt_me') || '')

  // `force` bypasses the in-flight guard. It is required after our OWN write:
  // at that point inflight is still > 0, so a guarded refresh would silently
  // no-op and the UI would only update on the next 8s poll.
  const refresh = useCallback(async (force = false) => {
    if (!force && inflight.current > 0) return
    try {
      const r = await fetch(API + '/state', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setState(await r.json())
      setStatus('ok')
    } catch (e) {
      setStatus('err')
      setError(String(e.message || e))
    }
  }, [])

  useEffect(() => {
    refresh()
    // The poll must never clobber a write in progress; the explicit
    // force-refresh after each write is what keeps the UI immediate.
    const t = setInterval(() => refresh(), 8000)
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [refresh])

  const send = useCallback(async (path, body) => {
    inflight.current++
    setStatus('saving')
    try {
      await post(path, { ...body, by: me || undefined })
      await refresh(true)
      setStatus('ok')
      setError(null)
      return true
    } catch (e) {
      setStatus('err')
      setError(String(e.message || e))
      return false
    } finally {
      inflight.current--
    }
  }, [refresh, me])

  const chooseMe = useCallback((id) => {
    localStorage.setItem('rt_me', id)
    setMe(id)
  }, [])

  return { state, status, error, send, refresh, me, chooseMe }
}

export async function uploadDoc(file, meta) {
  const fd = new FormData()
  fd.append('file', file)
  for (const [k, v] of Object.entries(meta)) if (v != null) fd.append(k, v)
  const r = await fetch(API + '/docs/upload', { method: 'POST', body: fd })
  if (!r.ok) {
    let msg = `HTTP ${r.status}`
    try { msg = (await r.json()).error || msg } catch {}
    throw new Error(msg)
  }
  return r.json()
}
