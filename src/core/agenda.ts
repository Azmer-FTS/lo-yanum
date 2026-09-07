import type { AgendaEvent } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AB4.3 (2026-09-08) — LA GÉOMÉTRIE D'UNE JOURNÉE, EN DEHORS DE REACT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « chevauchements de rendez-vous côte à côte et non superposés »
 *
 * ⚠️ IT IS IN @core AND NOT BESIDE THE GRID THAT DRAWS IT, FOR ONE REASON: a
 *    claim about arithmetic should not need Chromium to answer. The demo
 *    fixture happens to contain no two appointments at the same hour on the
 *    same day, so a browser gate could drive this screen all afternoon and
 *    never once exercise the case the product owner asked for. `bun run
 *    abpass` asserts it directly, on literals.
 *
 * PURE: no React, no DOM — like everything else under /src/core.
 */

/** A visit is a point in time; it still needs a block a thumb can hit. */
export const MIN_EVENT_MINUTES = 45

const MINUTES_IN_DAY = 24 * 60

/**
 * ★★ AB4.3 — TWO APPOINTMENTS AT THE SAME HOUR ARE SIDE BY SIDE.
 *
 * « chevauchements de rendez-vous côte à côte et non superposés »
 *
 * The events of one day are swept in start order into CLUSTERS — a maximal run
 * of events reachable from each other through overlaps — and the cluster's
 * width is shared between its LANES. A lane is reused by the next event that
 * starts after the last one in it has finished.
 *
 * ⚠️ THE CLUSTER DECIDES THE WIDTH, THE LANES DECIDE WHO SHARES IT, AND THOSE
 *    ARE TWO DIFFERENT QUESTIONS. Splitting per PAIR would stack a third event
 *    on the second: A 20:00–24:00 overlaps B 21:00–22:00 and C 23:00–23:30
 *    while B and C do not touch each other. The cluster is {A,B,C}, so all
 *    three are drawn at the same width — but B and C take the SAME lane,
 *    because nothing is gained by leaving a hole where C could stand. Two
 *    columns, three visible blocks, and no two overlapping events on top of
 *    one another, which is the whole of the product owner's sentence.
 *
 * ⚠️ AND THE COMPARISON IS ON THE DAY'S OWN MINUTES, clamped to it. A guard
 *    that runs past midnight is drawn to the foot of its own day and picked up
 *    again at the head of the next one — the alternative, a block that
 *    overflows its column, is a block drawn over the neighbouring day.
 */
export interface LaidOut {
  event: AgendaEvent
  /** Minutes from 00:00 of the day being drawn. */
  from: number
  to: number
  lane: number
  lanes: number
}

export function layOutDay(events: readonly AgendaEvent[], day: Date): LaidOut[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  const dayEnd = dayStart + MINUTES_IN_DAY * 60_000

  const spans = events
    .map((event) => {
      const startMs = new Date(event.at).getTime()
      const rawEnd = new Date(event.endAt).getTime()
      const endMs = Number.isFinite(rawEnd) && rawEnd > startMs ? rawEnd : startMs
      const from = Math.max(0, Math.round((startMs - dayStart) / 60_000))
      const toRaw = Math.round((Math.min(endMs, dayEnd) - dayStart) / 60_000)
      const to = Math.min(MINUTES_IN_DAY, Math.max(from + MIN_EVENT_MINUTES, toRaw))
      return { event, from, to }
    })
    .sort((a, b) => a.from - b.from || a.to - b.to)

  const out: LaidOut[] = []
  let cluster: typeof spans = []
  let clusterEnd = -1

  const flush = (): void => {
    if (cluster.length === 0) return
    /* Lanes inside the cluster: the first lane whose last event has finished. */
    const laneEnds: number[] = []
    for (const span of cluster) {
      let lane = laneEnds.findIndex((end) => end <= span.from)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(span.to)
      } else {
        laneEnds[lane] = span.to
      }
      out.push({ ...span, lane, lanes: 0 })
    }
    const lanes = laneEnds.length
    for (let i = out.length - cluster.length; i < out.length; i++) out[i].lanes = lanes
    cluster = []
    clusterEnd = -1
  }

  for (const span of spans) {
    if (cluster.length > 0 && span.from >= clusterEnd) flush()
    cluster.push(span)
    clusterEnd = Math.max(clusterEnd, span.to)
  }
  flush()

  return out
}

