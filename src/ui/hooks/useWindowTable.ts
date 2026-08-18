import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useRef, useState } from 'react'

/**
 * G7 — window-virtualised table plumbing, shared by the volunteers, drivers
 * and farms rosters.
 *
 * The window is the scroll container (the whole point of G7: one page, one
 * scrollbar), so the virtualizer needs to know where the list STARTS in page
 * coordinates — `scrollMargin`. The obvious `listRef.current?.offsetTop ?? 0`
 * is wrong twice: it is 0 on the first render (the ref is not attached yet,
 * and nothing re-renders to fix it — scrolling then computes every row ~1000px
 * below where it draws it, which reads as a blank page), and `offsetTop` is
 * relative to the nearest positioned ancestor, not to the page. So the margin
 * is measured after every commit from the bounding rect + scrollY, behind an
 * equality guard so re-measuring is not a render loop.
 *
 * Rows must position themselves at `item.start - margin` (item coordinates
 * are page-relative, the container's are its own).
 */
export function useWindowTable(
  count: number,
  estimateSize: (index: number) => number,
) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const [margin, setMargin] = useState(0)

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const next = Math.round(el.getBoundingClientRect().top + window.scrollY)
    setMargin((prev) => (prev === next ? prev : next))
  })

  const virtualizer = useWindowVirtualizer({
    count,
    estimateSize,
    overscan: 12,
    scrollMargin: margin,
  })

  return { listRef, virtualizer, margin }
}
