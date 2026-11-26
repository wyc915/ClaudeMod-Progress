import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'progress-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: true,
    maxRows: 3,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 3 },
    view: {},
  },
} as const

test('顯示目前工具、進度百分比與剩餘時間', async ($, on) => {
  let t = 1_000_000
  on('clock.now', () => ({ value: t }))
  on('clock.every', () => ({ value: undefined }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  let id = 0
  on('tool.call', (_, e) =>
    e.tool === 'TaskCreate' ? { result: { task: { id: String(++id), subject: e.subject } } } : { result: {} },
  )

  await $.turn.start({ text: 'go', turnId: 't1' })
  for (const s of ['A', 'B', 'C', 'D']) {
    await $.tool.call({ tool: 'TaskCreate', subject: s, description: s })
  }
  t += 10_000
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /1\/4/ }))?.text).toContain('(25%)')
    expect((await ui.find({ type: 'Text', text: /預估剩餘/ }))?.text).toContain('~30s')
    await ui.unmount()
  }
})

test('沒有資料時不顯示', async $ => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /已用/ })).toBe(undefined)
  await ui.unmount()
})
