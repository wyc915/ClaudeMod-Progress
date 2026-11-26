import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import type { Run, Task } from '../types'

const runAtom = atom({ plugin: 'progress-band', key: 'run' } as const, null)
const nowAtom = atom({ plugin: 'progress-band', key: 'now' } as const, 0)
const hiddenAtom = atom({ plugin: 'progress-band', key: 'isHidden' } as const, false)

/** 毫秒 → 1h02m / 3m05s / 12s */
export const fmt = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h) return `${h}h${String(m).padStart(2, '0')}m`
  if (m) return `${m}m${String(r).padStart(2, '0')}s`
  return `${r}s`
}

const bar = (ratio: number, width = 10): string => {
  const n = Math.round(ratio * width)
  return '█'.repeat(n) + '░'.repeat(width - n)
}

const clip = (s: string, n = 40): string => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}

/** 取工具最有意義的參數做摘要 */
const describe = (e: Record<string, unknown>): string => {
  const tool = String(e.tool)
  for (const k of ['description', 'command', 'file_path', 'pattern', 'query', 'url', 'prompt', 'subject', 'skill']) {
    const v = e[k]
    if (typeof v === 'string' && v) return `${tool} – ${clip(v)}`
  }
  return tool
}

/** 進度與 ETA：平均每項耗時 × 剩餘項數 */
export const progress = (run: Run, now: number) => {
  const tasks = run.tasks
  const total = tasks.length
  const done = tasks.filter(t => t.status === 'completed').length
  const end = run.isRunning ? now : run.endedAt
  const elapsed = end - run.startedAt
  let eta: number | null = null
  if (run.isRunning && done > 0 && done < total) {
    const lastDone = Math.max(...tasks.map(t => t.doneAt ?? 0))
    eta = ((lastDone - run.startedAt) / done) * (total - done)
  }
  const active = tasks.find(t => t.status === 'in_progress')
  return { total, done, elapsed, eta, active }
}

export const register: Register = on => {
  let tick: Timer | undefined

  const stopTick = () => {
    tick?.cancel()
    tick = undefined
  }

  on('turn.start', async ($, e, next) => {
    if (e.agentId) return next(e)
    const now = await $.clock.now()
    // 新的一輪：保留未完成的任務清單（跨輪接續），清掉已全部完成的
    await update($, runAtom, prev => {
      const keep = prev && prev.tasks.some(t => t.status !== 'completed') ? prev.tasks : []
      return { isRunning: true, startedAt: now, endedAt: 0, current: '思考中…', tasks: keep }
    })
    await update($, nowAtom, () => now)
    stopTick()
    tick = $.clock.every(1000, async () => {
      const t = await $.clock.now()
      await update($, nowAtom, () => t)
    })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const label = (e.agentId ? '[子代理] ' : '') + describe(e as unknown as Record<string, unknown>)
    await update($, runAtom, r => (r ? { ...r, current: label } : r))

    const res = await next(e)
    if ('deny' in res && res.deny) return res
    const now = await $.clock.now()

    if (e.tool === 'TodoWrite') {
      const todos = e.todos ?? []
      await update($, runAtom, r => {
        if (!r) return r
        const old = new Map(r.tasks.map(t => [t.id, t]))
        const tasks: Task[] = todos.map((td, i) => {
          const id = `todo-${i}`
          const prev = old.get(id)
          const doneAt = td.status === 'completed' ? (prev?.doneAt ?? now) : undefined
          return { id, subject: td.activeForm || td.content, status: td.status, doneAt }
        })
        return { ...r, tasks }
      })
    } else if (e.tool === 'TaskCreate' && !res.isError) {
      const id = (res.result as { task?: { id?: string } } | undefined)?.task?.id
      if (id) {
        const subject = e.activeForm || e.subject
        await update($, runAtom, r =>
          r ? { ...r, tasks: [...r.tasks.filter(t => t.id !== id), { id, subject, status: 'pending' } as Task] } : r,
        )
      }
    } else if (e.tool === 'TaskUpdate' && !res.isError) {
      const { taskId, status } = e
      await update($, runAtom, r => {
        if (!r) return r
        if (status === 'deleted') return { ...r, tasks: r.tasks.filter(t => t.id !== taskId) }
        return {
          ...r,
          tasks: r.tasks.map(t =>
            t.id !== taskId
              ? t
              : {
                  ...t,
                  subject: e.activeForm || e.subject || t.subject,
                  status: status ?? t.status,
                  doneAt: status === 'completed' ? now : status ? undefined : t.doneAt,
                },
          ),
        }
      })
    }

    await update($, runAtom, r => (r && r.current === label ? { ...r, current: '思考中…' } : r))
    return res
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)
    stopTick()
    const now = await $.clock.now()
    await update($, runAtom, r =>
      r ? { ...r, isRunning: false, endedAt: now, current: e.isAborted ? '已中斷' : '完成' } : r,
    )
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const run = await read($, runAtom)
    if (e.props.hasSurvey || !run) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    if (await read($, hiddenAtom)) {
      return <Button key="show" label="顯示進度" onPress={() => update($, hiddenAtom, () => false)} />
    }

    const now = await read($, nowAtom)
    const p = progress(run, now)
    const icon = run.isRunning ? '▶' : '✔'
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
    const what = p.active && run.isRunning ? `${p.active.subject} · ${run.current}` : run.current

    return (
      <Box flexDirection="row">
        <Text key="cur" color={run.isRunning ? 'cyan' : 'green'}>
          {icon} {clip(what, 60)}{' '}
        </Text>
        {p.total > 0 ? (
          <Text key="pct">
            │ {p.done}/{p.total} ({pct}%) {bar(p.total ? p.done / p.total : 0)}{' '}
          </Text>
        ) : null}
        <Text key="time" dimColor>
          │ 已用 {fmt(p.elapsed)}
          {p.eta !== null ? ` · 預估剩餘 ~${fmt(p.eta)}` : ''}{' '}
        </Text>
        <Button key="hide" label="隱藏" onPress={() => update($, hiddenAtom, () => true)} />
      </Box>
    )
  })
}
