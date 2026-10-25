import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentNode, Board, CardHead, JobView } from '../types'

const PANE = 'readout'
const MAIN = 'main'
const TICK_MS = 1000
const DEFAULT_PORT = 8765
const PROMPT_SECTION_ID = 'readout:visual-first'
const SPARK_COLS = 24
const SERIES_MAX = 200
const JOB_HIDE_AFTER_MS = 60 * 60 * 1000
const DONE_AGENTS_KEPT = 20
const SESSION_STALE_MS = 10 * 60 * 1000
const CARDS_LISTED = 200
const CARDS_SCANNED_FOR_MERGE = 20
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
const BARS = [0x2581, 0x2582, 0x2583, 0x2584, 0x2585, 0x2586, 0x2587, 0x2588]

const board = atom(
  { plugin: 'readout', key: 'board' } as const,
  { agents: {}, jobs: [], now: 0 } as Board,
  { shape: 'board-1' },
)

function touch(all: Record<string, AgentNode>, id: string, fn: (n: AgentNode) => AgentNode) {
  const node = all[id] ?? {
    id,
    parent: id === MAIN ? undefined : MAIN,
    type: id === MAIN ? 'main' : 'agent',
    description: '',
    status: 'running',
    toolCount: 0,
    startedAt: Date.now(),
  }
  return { ...all, [id]: fn(node) }
}

function prune(all: Record<string, AgentNode>) {
  const done = Object.values(all)
    .filter(n => n.status === 'done')
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  const drop = new Set(done.slice(DONE_AGENTS_KEPT).map(n => n.id))
  return Object.fromEntries(Object.entries(all).filter(([id]) => !drop.has(id)))
}

// One emitted line: {t, stage, pct, msg, ...numeric metrics}; the first numeric metric feeds the sparkline.
function parseJob(name: string, text: string): JobView | undefined {
  const rows = text
    .split('\n')
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line) as Record<string, unknown>]
      } catch {
        return []
      }
    })
  const last = rows.at(-1)
  if (!last) return undefined
  const reserved = new Set(['t', 'stage', 'pct', 'msg'])
  const isMetric = (r: Record<string, unknown>, k: string) => !reserved.has(k) && typeof r[k] === 'number'
  // The last row may carry no metric (a final "done"), so take it from the latest row that does.
  const withMetric = rows.findLast(r => Object.keys(r).some(k => isMetric(r, k)))
  const metric = withMetric && Object.keys(withMetric).find(k => isMetric(withMetric, k))
  return {
    name,
    stage: String(last.stage ?? ''),
    pct: typeof last.pct === 'number' ? last.pct : undefined,
    msg: String(last.msg ?? ''),
    updatedAt: typeof last.t === 'number' ? last.t * 1000 : Date.now(),
    metric,
    series: metric
      ? rows.flatMap(r => (typeof r[metric] === 'number' ? [r[metric] as number] : [])).slice(-SERIES_MAX)
      : [],
  }
}

async function listNames($: EngineInterface, dir: string, ext: string) {
  try {
    return (await $.fs.list(dir)).filter(f => f.kind === 'file' && f.name.endsWith(ext)).map(f => f.name)
  } catch {
    return []
  }
}

async function listCards($: EngineInterface, dir: string) {
  try {
    return (await $.fs.list(`${dir}/cards`))
      .filter(f => f.kind === 'file' && f.name.endsWith('.json'))
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, CARDS_LISTED)
      .map(f => ({ name: f.name, size: f.size }))
  } catch {
    return []
  }
}

async function readJobs($: EngineInterface, dir: string, now: number) {
  const jobs: JobView[] = []
  for (const file of await listNames($, `${dir}/jobs`, '.jsonl')) {
    // shortcut: rereads the whole file each tick, fine to a few MB; tail by offset when logs grow larger.
    const job = parseJob(file.slice(0, -'.jsonl'.length), (await $.fs.read(`${dir}/jobs/${file}`, { as: 'text' })) as string)
    if (job && now - job.updatedAt < JOB_HIDE_AFTER_MS) jobs.push(job)
  }
  return jobs.sort((a, b) => b.updatedAt - a.updatedAt)
}

async function liveSessions($: EngineInterface, dir: string, now: number) {
  const ids: string[] = []
  for (const file of await listNames($, `${dir}/sessions`, '.json')) {
    try {
      const s = JSON.parse((await $.fs.read(`${dir}/sessions/${file}`, { as: 'text' })) as string) as { updatedAt?: number }
      if (now - (s.updatedAt ?? 0) < SESSION_STALE_MS) ids.push(file.slice(0, -'.json'.length))
    } catch {
      // a file mid-write by another session reads as broken; it is listed on the next tick
    }
  }
  return ids
}

function sparkline(series: number[]) {
  const tail = series.slice(-SPARK_COLS)
  const lo = Math.min(...tail)
  const span = Math.max(...tail) - lo || 1
  const words = new Uint32Array(SPARK_COLS * 3)
  for (let c = 0; c < SPARK_COLS; c++) {
    const v = tail[c - (SPARK_COLS - tail.length)]
    words[c * 3] = v === undefined ? 0x20 : (BARS[Math.round(((v - lo) / span) * 7)] ?? 0x20)
    words[c * 3 + 1] = 0x5fafff
    words[c * 3 + 2] = 0x01000000
  }
  // toBase64 exists in the hooks runtime; the es2023 lib the types target does not declare it.
  return (new Uint8Array(words.buffer) as Uint8Array & { toBase64(): string }).toBase64()
}

type Ctx = { dir: string; cwd: string; sessionId: string; port: number }
// Set by session.start, which runs again after every reload.
let ctx: Ctx | undefined

type Block = { kind: string; title?: string; [field: string]: unknown }
type Card = {
  id: string
  type: string
  title: string
  status: string
  verdict: string
  project: string
  createdAt: number
  updatedAt: number
  blocks: Block[]
  repro: { commit?: string }
  session?: string
  auto?: boolean
  [field: string]: unknown
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function git($: EngineInterface, cwd: string, args: string[]) {
  const r = await $.process.run(['git', '-C', cwd, ...args])
  return r.exitCode === 0 ? r.stdout : undefined
}

async function lineCount($: EngineInterface, path: string) {
  try {
    const text = (await $.fs.read(path, { as: 'text' })) as string
    return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  } catch {
    return null
  }
}

// numstat paths are repo-relative; touched paths are absolute.
async function fileRows($: EngineInterface, cwd: string, files: string[]) {
  const numstat = (await git($, cwd, ['diff', '--numstat', 'HEAD', '--', ...files])) ?? ''
  const stats = numstat
    .split('\n')
    .filter(Boolean)
    .map(line => line.split('\t'))
  // git diff skips untracked files, so a file created this turn is counted whole as added.
  const untracked = new Set(
    ((await git($, cwd, ['ls-files', '--others', '--exclude-standard', '--full-name', '--', ...files])) ?? '')
      .split('\n')
      .filter(Boolean),
  )
  const rows = []
  for (const path of files) {
    const hit = stats.find(([, , rel]) => rel !== undefined && (path === rel || path.endsWith(`/${rel}`)))
    const isNew = !hit && [...untracked].some(rel => path === rel || path.endsWith(`/${rel}`))
    const added = hit ? Number(hit[0]) : isNew ? await lineCount($, path) : null
    rows.push({
      path: path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path,
      added,
      removed: hit ? Number(hit[1]) : isNew ? 0 : null,
    })
  }
  return rows
}

async function writeCard($: EngineInterface, dir: string, card: Card) {
  const path = `${dir}/cards/${card.id}.json`
  await $.fs.write(`${path}.tmp`, JSON.stringify({ ...card, updatedAt: Date.now() / 1000 }, null, 1))
  await $.process.run(['mv', `${path}.tmp`, path])
}

// The card Claude wrote for this turn, if any: same project, created after the turn started.
async function cardOfTurn($: EngineInterface, dir: string, cwd: string, startedAt: number) {
  const names = (await listNames($, `${dir}/cards`, '.json')).sort().reverse().slice(0, CARDS_SCANNED_FOR_MERGE)
  for (const name of names) {
    try {
      const card = JSON.parse((await $.fs.read(`${dir}/cards/${name}`, { as: 'text' })) as string) as Card
      if (!card.auto && card.project === cwd && card.createdAt * 1000 >= startedAt) return card
    } catch {
      // a card mid-write is skipped; the turn then gets its own auto card
    }
  }
  return undefined
}

async function recordTurn($: EngineInterface, c: Ctx, b: Board): Promise<CardHead | undefined> {
  const turn = b.turn
  if (!turn) return undefined
  const jobs = b.jobs.filter(j => j.updatedAt >= turn.startedAt)
  if (turn.files.length === 0 && jobs.length === 0) return undefined

  const blocks: Block[] = []
  if (turn.files.length) blocks.push({ kind: 'files', title: '바뀐 파일', rows: await fileRows($, c.cwd, turn.files) })
  for (const job of jobs.filter(j => j.series.length > 1))
    blocks.push({ kind: 'chart', title: `${job.name} ${job.metric}`, series: [{ name: job.metric, points: job.series }] })
  const agents = Object.values(b.agents).filter(a => a.id === MAIN || a.startedAt >= turn.startedAt)
  blocks.push({
    kind: 'timeline',
    title: '진행 과정',
    agents: agents.map(a => ({
      type: a.type,
      description: a.id === MAIN ? '' : a.description,
      toolCount: a.toolCount,
      startedAt: a.id === MAIN ? turn.startedAt : a.startedAt,
      endedAt: a.endedAt ?? Date.now(),
    })),
  })
  const commit = (await git($, c.cwd, ['rev-parse', '--short', 'HEAD']))?.trim()

  const written = await cardOfTurn($, c.dir, c.cwd, turn.startedAt)
  if (written) {
    const kinds = new Set(written.blocks.map(x => x.kind))
    written.blocks.push(...blocks.filter(x => !kinds.has(x.kind)))
    written.repro = { ...written.repro, commit: written.repro?.commit ?? commit }
    written.session = c.sessionId
    await writeCard($, c.dir, written)
    return { title: written.title, status: written.status, verdict: written.verdict }
  }
  const now = Date.now() / 1000
  const card: Card = {
    id: `${stamp()}-auto-${Math.random().toString(16).slice(2, 6)}`,
    type: 'change',
    title: `자동 기록: ${c.cwd.split('/').pop()}`,
    status: turn.toolErrors ? 'partial' : 'success',
    verdict: `자동 기록 · 해석 없음 (파일 ${turn.files.length}개, 작업 ${jobs.length}개, 도구 오류 ${turn.toolErrors}건)`,
    auto: true,
    project: c.cwd,
    session: c.sessionId,
    turnStartedAt: turn.startedAt / 1000,
    createdAt: now,
    updatedAt: now,
    blocks,
    confidence: [],
    next: [],
    repro: commit ? { commit } : {},
  }
  await writeCard($, c.dir, card)
  return { title: card.title, status: card.status, verdict: card.verdict }
}

function bar(pct: number, width = 10) {
  const full = Math.round((Math.min(100, Math.max(0, pct)) / 100) * width)
  return '█'.repeat(full) + '░'.repeat(width - full)
}

function elapsed(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

type Options = { port?: number; tunnelHost?: string; visualFirst?: boolean }

export const register: Register = (on, options) => {
  const opts = options as Options
  const port = opts.port || DEFAULT_PORT
  let promptSection: string | undefined

  on('session.start', async ($, e, next) => {
    // Same default as src/readout/paths.py, so Python jobs and the mod meet in one folder.
    const dir = (await $.env.get('READOUT_DIR')) || `${await $.env.get('HOME')}/.claude/readout`
    const sessionId = await $.session.id()
    const cwd = await $.session.cwd()
    ctx = { dir, cwd, sessionId, port }
    await $.process.run(['mkdir', '-p', `${dir}/jobs`, `${dir}/sessions`, `${dir}/cards`])
    // Relinked every start, so a plugin update serves its own dashboard.
    await $.process.run(['ln', '-sfn', `${$.plugin.root}/dashboard/index.html`, `${dir}/index.html`])
    // Detached so the dashboard outlives this session; a second session's start fails on the taken port, harmlessly.
    await $.process.run(['sh', '-c', `nohup python3 -m http.server ${port} --bind 127.0.0.1 -d "${dir}" >/dev/null 2>&1 &`])
    // The Orca browser may run on another machine: forward its loopback port here. A taken port means a tunnel is already up.
    // shortcut: no reconnect after the link drops; the next session start reopens it.
    const tunnelHost = opts.tunnelHost
    if (tunnelHost && /^[\w.@-]+$/.test(tunnelHost))
      await $.process.run([
        'sh',
        '-c',
        `nohup ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ConnectTimeout=5 -o ServerAliveInterval=30 -R 127.0.0.1:${port}:127.0.0.1:${port} ${tunnelHost} >/dev/null 2>&1 &`,
      ])
    await update($, board, b => ({ ...b, agents: touch(b.agents, MAIN, n => ({ ...n, status: 'idle', description: cwd })) }))

    $.clock.every(TICK_MS, async () => {
      const now = Date.now()
      const jobs = await readJobs($, dir, now)
      const b = await update($, board, b => ({ ...b, jobs, now, agents: prune(b.agents) }))
      await $.fs.write(
        `${dir}/sessions/${sessionId}.json`,
        JSON.stringify({ id: sessionId, cwd, updatedAt: now, agents: Object.values(b.agents) }),
      )
      await $.fs.write(
        `${dir}/index.json`,
        JSON.stringify({
          updatedAt: now,
          sessions: await liveSessions($, dir, now),
          jobs,
          cards: await listCards($, dir),
        }),
      )
    })

    await $.command.register({ name: 'readout', description: 'Open the readout pane' })
    if ((await $.session.surfaces()).length) void $.ui.open({ id: PANE, title: 'Readout' })
    return next(e)
  })

  on('command.run', { command: 'readout' }, async $ => {
    const { isPlaced } = await $.ui.open({ id: PANE, title: 'Readout' })
    return { text: `${isPlaced ? 'Readout pane opened' : 'Readout pane waits for a wider terminal'}; dashboard at http://localhost:${port}` }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (opts.visualFirst === false) return composed
    promptSection ??= ((await $.fs.read(`${$.plugin.root}/hooks/visual-first.md`, { as: 'text' })) as string).replaceAll('<port>', String(port))
    return { sections: [...composed.sections, { id: PROMPT_SECTION_ID, text: promptSection, scope: 'session' as const }] }
  })

  on('turn.start', async ($, e, next) => {
    const isMain = e.agentId === undefined
    await update($, board, b => ({
      ...b,
      turn: isMain ? { startedAt: Date.now(), files: [], toolErrors: 0 } : b.turn,
      agents: touch(b.agents, e.agentId ?? MAIN, n => ({ ...n, status: 'running' })),
    }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    await update($, board, b => ({
      ...b,
      agents: touch(b.agents, id, n => ({
        ...n,
        status: id === MAIN ? 'idle' : 'done',
        currentTool: undefined,
        endedAt: id === MAIN ? undefined : Date.now(),
      })),
    }))
    if (id === MAIN && ctx) {
      const c = ctx
      const lastCard = await recordTurn($, c, await read($, board))
      await update($, board, b => ({ ...b, turn: undefined, lastCard: lastCard ?? b.lastCard }))
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const agentId = 'agentId' in result ? result.agentId : undefined
    if (agentId)
      await update($, board, b => ({
        ...b,
        agents: {
          ...b.agents,
          [agentId]: {
            id: agentId,
            parent: e.parentAgentId ?? MAIN,
            type: e.subagentType,
            description: e.description,
            status: 'running' as const,
            toolCount: 0,
            startedAt: Date.now(),
          },
        },
      }))
    return result
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const input = e as { file_path?: string; notebook_path?: string }
    const path = EDIT_TOOLS.has(e.tool) ? (input.file_path ?? input.notebook_path) : undefined
    await update($, board, b => ({
      ...b,
      turn: b.turn && path && !b.turn.files.includes(path) ? { ...b.turn, files: [...b.turn.files, path] } : b.turn,
      agents: touch(b.agents, id, n => ({ ...n, status: 'running', currentTool: e.tool, toolCount: n.toolCount + 1 })),
    }))
    try {
      const ran = await next(e)
      if ('isError' in ran && ran.isError)
        await update($, board, b => ({ ...b, turn: b.turn && { ...b.turn, toolErrors: b.turn.toolErrors + 1 } }))
      return ran
    } finally {
      // shortcut: parallel calls in one agent show only the latest; keep a per-agent set if that misleads.
      await update($, board, b => ({
        ...b,
        agents: touch(b.agents, id, n => (n.currentTool === e.tool ? { ...n, currentTool: undefined } : n)),
      }))
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const b = await read($, board)
    const now = b.now || Date.now()
    const nodes = Object.values(b.agents)
    const rows: { node: AgentNode; depth: number }[] = []
    const walk = (parent: string | undefined, depth: number) => {
      for (const node of nodes.filter(n => n.parent === parent).sort((x, y) => x.startedAt - y.startedAt)) {
        rows.push({ node, depth })
        walk(node.id, depth + 1)
      }
    }
    walk(undefined, 0)

    return (
      <Box flexDirection="column">
        <Text bold>Agents</Text>
        {rows.map(({ node, depth }) => (
          <Text dimColor={node.status === 'done'} color={node.status === 'running' ? 'green' : undefined}>
            {'  '.repeat(depth)}
            {node.status.padEnd(7)} {node.type}
            {node.description && node.id !== MAIN ? ` "${node.description}"` : ''}
            {node.currentTool ? ` > ${node.currentTool}` : ''} ({node.toolCount} tools,{' '}
            {elapsed((node.endedAt ?? now) - node.startedAt)})
          </Text>
        ))}
        <Text bold>Jobs</Text>
        {b.jobs.length === 0 && <Text dimColor>No jobs. Report progress with readout.track or readout.emit.</Text>}
        {b.jobs.map(job => (
          <Box flexDirection="column">
            <Text dimColor={now - job.updatedAt > 30_000}>
              {job.name} {job.pct !== undefined ? `${bar(job.pct)} ${job.pct}%` : ''} {job.stage} {job.msg}
              {job.metric ? ` ${job.metric}=${job.series.at(-1)}` : ''}
            </Text>
            {job.series.length > 1 && e.surface === 'terminal' && 'Raster' in ui && (
              <ui.Raster key={`spark-${job.name}`} cells={sparkline(job.series)} columns={SPARK_COLS} rows={1} />
            )}
          </Box>
        ))}
        {b.lastCard && (
          <>
            <Text bold>Last result</Text>
            <Text color={b.lastCard.status === 'failed' ? 'red' : b.lastCard.status === 'partial' ? 'yellow' : 'green'}>
              {b.lastCard.status} {b.lastCard.title}: {b.lastCard.verdict}
            </Text>
          </>
        )}
        <Text dimColor>dashboard: http://localhost:{port}</Text>
      </Box>
    )
  })
}
