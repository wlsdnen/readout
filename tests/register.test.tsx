import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'readout',
  component: 'Pane',
  requestId: 'readout',
  props: {
    title: 'Readout',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('a subagent tool call shows that agent under main, on every surface', async ($, on) => {
  on('env.get', () => ({ value: '/tmp/readout-test' }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'readout' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.surfaces', () => ({ value: ['terminal'] }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^idle\s+main/ }))?.text).toContain('0 tools')
    expect((await ui.find({ type: 'Text', text: /running agent/ }))?.text).toMatch(/^  running agent \(1 tools/)
    await ui.unmount()
  }
})

function stubSession(
  on: Parameters<TestBody>[1],
  files: { name: string; text: string }[],
  git: (args: readonly string[]) => string | undefined = () => undefined,
) {
  const writes: { path: string; text: string }[] = []
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home' : undefined }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('process.run', (_, e) => {
    const out = e.argv[0] === 'git' ? git(e.argv.slice(3)) : ''
    return { value: { exitCode: out === undefined ? 128 : 0, stdout: out ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'readout' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.surfaces', () => ({ value: ['terminal'] }) as never)
  on('fs.list', (_, e) =>
    ({ value: e.path.endsWith('/cards') ? files.map(f => ({ name: f.name, kind: 'file', size: f.text.length })) : [] }) as never)
  on('fs.read', (_, e) => ({ value: files.find(f => e.path.endsWith(f.name))?.text ?? '' }))
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: {} }))
  return writes
}

const TURN_END = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

test('a turn that edits a file leaves an auto card naming it', async ($, on) => {
  const writes = stubSession(on, [])
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/a.ts', old_string: 'x', new_string: 'y' })
  await $.turn.complete(TURN_END)

  const cards = writes.filter(w => w.path.includes('/cards/'))
  expect(cards.length).toBe(1)
  const card = JSON.parse(cards[0]!.text)
  expect(card.auto).toBe(true)
  expect(card.blocks[0]).toEqual({ kind: 'files', title: '바뀐 파일', rows: [{ path: 'src/a.ts', added: null, removed: null }] })
})

test('a card written during the turn absorbs the auto blocks instead of a second card', async ($, on) => {
  const mine = { id: 'mine', type: 'change', title: 't', status: 'success', verdict: 'v', project: '/work',
    createdAt: Date.now() / 1000 + 1, updatedAt: 0, blocks: [{ kind: 'text', text: 'why' }], repro: {} }
  const writes = stubSession(on, [{ name: 'mine.json', text: JSON.stringify(mine) }])
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await $.tool.call({ tool: 'Write', file_path: '/work/b.md', content: 'x' })
  await $.turn.complete(TURN_END)

  const cards = writes.filter(w => w.path.includes('/cards/'))
  expect(cards.map(w => w.path)).toEqual(['/home/.claude/readout/cards/mine.json.tmp'])
  expect(JSON.parse(cards[0]!.text).blocks.map((x: { kind: string }) => x.kind)).toEqual(['text', 'files', 'timeline'])
})

test('a turn that only talks leaves no card', async ($, on) => {
  const writes = stubSession(on, [])
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  await $.turn.complete(TURN_END)
  expect(writes.filter(w => w.path.includes('/cards/')).length).toBe(0)
})

test('a file created this turn counts its lines as added', async ($, on) => {
  const writes = stubSession(on, [{ name: '/work/src/new.ts', text: 'a\nb\nc\n' }], args =>
    args[0] === 'ls-files' ? 'src/new.ts\n' : args[0] === 'diff' ? '1\t1\tsrc/old.ts\n' : 'abc1234\n',
  )
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'add', turnId: 't1' })
  await $.tool.call({ tool: 'Write', file_path: '/work/src/new.ts', content: 'a\nb\nc\n' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/old.ts', old_string: 'x', new_string: 'y' })
  await $.turn.complete(TURN_END)

  const card = JSON.parse(writes.find(w => w.path.includes('/cards/'))!.text)
  expect(card.blocks[0].rows).toEqual([
    { path: 'src/new.ts', added: 3, removed: 0 },
    { path: 'src/old.ts', added: 1, removed: 1 },
  ])
  expect(card.repro.commit).toBe('abc1234')
})

for (const visualFirst of [true, false])
  test(`visualFirst ${visualFirst} ${visualFirst ? 'adds' : 'leaves out'} the reporting section`, { options: { visualFirst } }, async ($, on) => {
    on('fs.read', () => ({ value: 'report on port <port>' }))
    on('prompt.compose', () => ({ sections: [{ id: 'core', text: 'core', scope: 'shared' }] }))
    const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never)
    expect(sections.map(x => x.id)).toEqual(visualFirst ? ['core', 'readout:visual-first'] : ['core'])
    if (visualFirst) expect(sections[1]!.text).toBe('report on port 8765')
  })
