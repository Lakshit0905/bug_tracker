import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, MessageSquare, Paperclip, Upload } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { ApiError, downloadFile } from '../../api/client'
import { bugsApi } from '../../api/endpoints'
import { useAuth } from '../../context/AuthContext'
import { qk, useAttachments, useComments, useDevelopers, useHistory, useTransitions } from '../../hooks/queries'
import { LEVEL_LABEL, STATUS_LABEL, dateTime, describeHistory, fileSize, timeAgo } from '../../lib/format'
import { LEVELS, type AllowedTransition, type Bug, type Priority } from '../../types/api'
import { Avatar, PersonChip, PriorityMark } from '../ui/Badges'
import { Button } from '../ui/Button'
import { Alert, Dialog, EmptyState, Skeleton, useToast } from '../ui/Feedback'
import { TextArea, controlClass } from '../ui/Field'

function useInvalidateBug(bugId: number) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: qk.bug(bugId) })
    qc.invalidateQueries({ queryKey: ['bugs'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
}

// ------------------------------------------------------------------ status actions

export function TransitionActions({ bug }: { bug: Bug }) {
  const { data: transitions, isLoading } = useTransitions(bug.id)
  const [pending, setPending] = useState<AllowedTransition | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const invalidate = useInvalidateBug(bug.id)

  const mutation = useMutation({
    mutationFn: (t: AllowedTransition) =>
      bugsApi.transition(bug.id, t.to_status, {
        ...(t.requires_resolution_notes ? { resolution_notes: text } : {}),
        ...(t.requires_reason ? { reason: text } : {}),
      }),
    onSuccess: (updated) => {
      toast.success(`${updated.key} moved to ${STATUS_LABEL[updated.status]}`)
      setPending(null)
      setText('')
      invalidate()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
  })

  const start = (t: AllowedTransition) => {
    setError(null)
    if (t.requires_reason || t.requires_resolution_notes) {
      setText(t.requires_resolution_notes ? (bug.resolution_notes ?? '') : '')
      setPending(t)
    } else {
      mutation.mutate(t)
    }
  }

  if (isLoading) return <Skeleton className="h-8 w-40" />
  if (!transitions?.length) return null

  return (
    <>
      <div className="flex flex-wrap gap-2" data-testid="transition-actions">
        {transitions.map((t, i) => (
          <Button
            key={t.to_status}
            variant={i === 0 ? 'primary' : 'secondary'}
            loading={mutation.isPending && mutation.variables?.to_status === t.to_status && !pending}
            onClick={() => start(t)}
            data-testid={`transition-${t.to_status}`}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {error && !pending && <div className="mt-3"><Alert>{error}</Alert></div>}
      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.requires_reason ? `Reopen ${bug.key}` : `Resolve ${bug.key}`}
        testId="transition-dialog"
        footer={
          <>
            <Button onClick={() => setPending(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!text.trim()}
              loading={mutation.isPending}
              onClick={() => pending && mutation.mutate(pending)}
              data-testid="confirm-transition"
            >
              {pending?.label}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {error && <Alert>{error}</Alert>}
          <TextArea
            label={pending?.requires_reason ? 'Why is it being reopened?' : 'What was fixed?'}
            required
            rows={4}
            value={text}
            maxLength={pending?.requires_reason ? 2000 : 5000}
            onChange={(e) => setText(e.target.value)}
            data-testid="transition-text"
            hint={pending?.requires_reason ? 'This is posted as a comment and notifies the developer and project managers.' : 'Visible to the tester who verifies the fix.'}
            autoFocus
          />
        </div>
      </Dialog>
    </>
  )
}

// ------------------------------------------------------------------ assignee & priority (PM)

export function AssignControl({ bug }: { bug: Bug }) {
  const { can } = useAuth()
  const allowed = can('bug:assign') && bug.status !== 'CLOSED'
  const { data: devs } = useDevelopers(allowed)
  const toast = useToast()
  const invalidate = useInvalidateBug(bug.id)
  const mutation = useMutation({
    mutationFn: (id: number | null) => bugsApi.assign(bug.id, id),
    onSuccess: (b) => {
      toast.success(b.assignee ? `Assigned to ${b.assignee.full_name}` : 'Assignee removed')
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
  if (!allowed) return <PersonChip name={bug.assignee?.full_name} />
  const locked = bug.status === 'IN_PROGRESS' || bug.status === 'RESOLVED'
  return (
    <select
      aria-label="Assignee"
      data-testid="assignee-select"
      className={`${controlClass} h-8 px-2`}
      value={bug.assignee?.id ?? ''}
      disabled={mutation.isPending}
      onChange={(e) => mutation.mutate(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="" disabled={locked}>
        {locked ? 'Unassigned (not allowed while in work)' : 'Unassigned'}
      </option>
      {devs?.map((d) => (
        <option key={d.id} value={d.id}>
          {d.full_name}
        </option>
      ))}
    </select>
  )
}

export function PriorityControl({ bug }: { bug: Bug }) {
  const { can } = useAuth()
  const toast = useToast()
  const invalidate = useInvalidateBug(bug.id)
  const mutation = useMutation({
    mutationFn: (p: Priority) => bugsApi.setPriority(bug.id, p),
    onSuccess: (b) => {
      toast.success(`Priority set to ${LEVEL_LABEL[b.priority]}`)
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
  if (!can('bug:set_priority') || bug.status === 'CLOSED') return <PriorityMark priority={bug.priority} />
  return (
    <select
      aria-label="Priority"
      data-testid="priority-select"
      className={`${controlClass} h-8 px-2`}
      value={bug.priority}
      disabled={mutation.isPending}
      onChange={(e) => mutation.mutate(e.target.value as Priority)}
    >
      {LEVELS.map((l) => (
        <option key={l} value={l}>
          {LEVEL_LABEL[l]}
        </option>
      ))}
    </select>
  )
}

// ------------------------------------------------------------------ activity: comments + history interleaved

export function ActivityFeed({ bugId }: { bugId: number }) {
  const { can } = useAuth()
  const comments = useComments(bugId)
  const history = useHistory(bugId)
  const [tab, setTab] = useState<'all' | 'comments' | 'history'>('all')
  const [body, setBody] = useState('')
  const toast = useToast()
  const invalidate = useInvalidateBug(bugId)
  const qc = useQueryClient()

  const add = useMutation({
    mutationFn: () => bugsApi.addComment(bugId, body.trim()),
    onSuccess: () => {
      setBody('')
      qc.invalidateQueries({ queryKey: qk.bugChildren(bugId) })
      invalidate()
    },
    onError: (e) => toast.error(e),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (body.trim()) add.mutate()
  }

  type Item = { kind: 'comment' | 'event'; id: string; at: string; node: React.ReactNode }
  const items: Item[] = []
  if (tab !== 'history')
    for (const c of comments.data ?? [])
      items.push({
        kind: 'comment',
        id: `c${c.id}`,
        at: c.created_at,
        node: (
          <div className="flex gap-3" data-testid="comment">
            <Avatar name={c.author.full_name} size={28} />
            <div className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3.5 py-2.5">
              <div className="mb-1 flex items-baseline gap-2 text-[13px]">
                <span className="font-medium">{c.author.full_name}</span>
                <span className="text-ink-3" title={dateTime(c.created_at)}>
                  {timeAgo(c.created_at)}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{c.body}</p>
            </div>
          </div>
        ),
      })
  if (tab !== 'comments')
    for (const h of history.data ?? [])
      if (h.action !== 'COMMENT_ADDED')
        items.push({
          kind: 'event',
          id: `h${h.id}`,
          at: h.created_at,
          node: (
            <div className="flex items-start gap-3 pl-1.5 text-[13px] text-ink-2" data-testid="history-entry">
              <span className="mt-1.5 size-2 shrink-0 rounded-full border-2 border-line-strong bg-surface" aria-hidden />
              <p>
                <span className="font-medium text-ink">{h.actor?.full_name ?? 'System'}</span> {describeHistory(h)}
                <span className="ml-1.5 text-ink-3" title={dateTime(h.created_at)}>
                  {timeAgo(h.created_at)}
                </span>
              </p>
            </div>
          ),
        })
  items.sort((a, b) => a.at.localeCompare(b.at))

  const loading = comments.isLoading || history.isLoading

  return (
    <section aria-label="Activity" className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-line">
        <h2 className="pb-2 text-[15px] font-semibold">Activity</h2>
        <div role="tablist" className="flex gap-1">
          {(['all', 'comments', 'history'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              data-testid={`activity-tab-${t}`}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-2.5 pb-2 text-[13px] capitalize ${tab === t ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<MessageSquare className="size-6" />} title="No comments yet">
          Start the conversation: ask for logs, share findings or confirm a fix.
        </EmptyState>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.id}>{i.node}</li>
          ))}
        </ol>
      )}

      {can('bug:comment') && (
        <form onSubmit={submit} className="flex flex-col gap-2" data-testid="comment-form">
          <label htmlFor="new-comment" className="sr-only">
            Add a comment
          </label>
          <textarea
            id="new-comment"
            rows={3}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment"
            data-testid="comment-input"
            className={`${controlClass} px-3 py-2`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e)
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-ink-3">Ctrl + Enter to post</span>
            <Button type="submit" variant="primary" size="sm" disabled={!body.trim()} loading={add.isPending} data-testid="post-comment">
              Post comment
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

// ------------------------------------------------------------------ attachments

const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.json,.zip'

export function Attachments({ bug }: { bug: Bug }) {
  const { can, user } = useAuth()
  const { data, isLoading } = useAttachments(bug.id)
  const input = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const qc = useQueryClient()
  const canUpload = can('bug:attach:any') || (can('bug:attach:assigned') && bug.assignee?.id === user?.id)

  const upload = useMutation({
    mutationFn: (f: File) => bugsApi.upload(bug.id, f),
    onSuccess: (a) => {
      toast.success(`Uploaded ${a.original_filename}`)
      qc.invalidateQueries({ queryKey: qk.bugChildren(bug.id) })
    },
    onError: (e) => toast.error(e),
  })

  return (
    <section aria-label="Attachments" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-ink">Attachments</h3>
        {canUpload && (
          <>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              hidden
              data-testid="attachment-input"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) upload.mutate(f)
                e.target.value = ''
              }}
            />
            <Button size="sm" variant="ghost" icon={<Upload className="size-3.5" />} loading={upload.isPending} onClick={() => input.current?.click()} data-testid="upload-attachment">
              Upload
            </Button>
          </>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-8" />
      ) : !data?.length ? (
        <p className="text-[13px] text-ink-3">
          {canUpload ? 'Screenshots, logs or PDFs up to 10 MB.' : 'No files attached.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line" data-testid="attachment-list">
          {data.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-2.5 py-2 text-[13px]">
              {a.content_type.startsWith('image/') ? <Paperclip className="size-3.5 text-ink-3" aria-hidden /> : <FileText className="size-3.5 text-ink-3" aria-hidden />}
              <span className="min-w-0 flex-1 truncate" title={a.original_filename}>
                {a.original_filename}
              </span>
              <span className="text-ink-3">{fileSize(a.size_bytes)}</span>
              <button
                type="button"
                className="rounded p-1 text-ink-3 hover:bg-sunken hover:text-ink"
                aria-label={`Download ${a.original_filename}`}
                onClick={() => downloadFile(a.download_url, a.original_filename).catch((e) => toast.error(e))}
              >
                <Download className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
