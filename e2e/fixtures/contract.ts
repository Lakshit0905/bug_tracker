/**
 * Contract-checking API client for black-box tests against the running server.
 *
 * Every call is made against a path *template* from the OpenAPI document (e.g. '/api/v1/bugs/{bug_id}'), so the
 * client can (1) look up what the server promises for that operation, (2) validate the actual response body
 * against the published JSON schema, (3) fail if the status code isn't documented at all, and (4) record the
 * operation for the endpoint-coverage report.
 */
import { request, type APIRequestContext, type APIResponse } from '@playwright/test'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { E2E } from '../data/env'
import type { Account } from '../data/users'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'
type Json = Record<string, unknown>

const here = path.dirname(fileURLToPath(import.meta.url))
export const OPS_LOG = path.resolve(here, '../reports/api-ops.ndjson')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let spec: any = null
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
const compiled = new Map<string, ReturnType<typeof ajv.compile>>()

export async function loadSpec() {
  if (spec) return spec
  const ctx = await request.newContext()
  spec = await (await ctx.get(`${E2E.apiOrigin}/openapi.json`)).json()
  await ctx.dispose()
  return spec
}

function validatorFor(template: string, method: string, status: number) {
  const key = `${method} ${template} ${status}`
  if (compiled.has(key)) return compiled.get(key)!
  const response = spec.paths?.[template]?.[method.toLowerCase()]?.responses?.[String(status)]
  if (!response) return null
  const schema = response.content?.['application/json']?.schema
  // Wrap with the document's components so internal "#/components/schemas/…" refs resolve.
  const v = schema ? ajv.compile({ ...schema, components: spec.components }) : undefined
  compiled.set(key, v!)
  return v
}

export interface CallResult<T = Json> {
  status: number
  body: T
  headers: Record<string, string>
  raw: APIResponse
}

export class ContractError extends Error {}

export class ContractClient {
  private constructor(
    private readonly ctx: APIRequestContext,
    public token: string | null,
    readonly refreshToken: string | null,
    readonly userId: number | null,
  ) {}

  static async anonymous() {
    await loadSpec()
    return new ContractClient(await request.newContext(), null, null, null)
  }

  static async as(account: Account) {
    const c = await ContractClient.anonymous()
    const res = await c.call<{ access_token: string; refresh_token: string; user: { id: number } }>('POST', '/auth/login', {
      json: { email: account.email, password: account.password },
      expect: 200,
    })
    return new ContractClient(c.ctx, res.body.access_token, res.body.refresh_token, res.body.user.id)
  }

  async call<T = Json>(
    method: Method,
    template: string,
    opts: {
      path?: Record<string, string | number>
      query?: Record<string, string | number | boolean | (string | number)[]>
      json?: unknown
      multipart?: Record<string, { name: string; mimeType: string; buffer: Buffer }>
      headers?: Record<string, string>
      expect?: number
      auth?: boolean
    } = {},
  ): Promise<CallResult<T>> {
    const fullTemplate = template.startsWith('/health') ? template : `/api/v1${template}`
    const url = fullTemplate.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(String(opts.path?.[k])))
    let qs = ''
    if (opts.query) {
      const p = new URLSearchParams()
      for (const [k, v] of Object.entries(opts.query)) (Array.isArray(v) ? v : [v]).forEach((x) => p.append(k, String(x)))
      qs = `?${p}`
    }
    const headers: Record<string, string> = { ...opts.headers }
    if (this.token && opts.auth !== false) headers.Authorization = `Bearer ${this.token}`

    const raw = await this.ctx.fetch(`${E2E.apiOrigin}${url}${qs}`, { method, headers, data: opts.json, multipart: opts.multipart })
    record(method, fullTemplate)

    const contentType = raw.headers()['content-type'] ?? ''
    const body = (contentType.includes('application/json') ? await raw.json() : await raw.body()) as T
    const status = raw.status()

    if (opts.expect !== undefined && status !== opts.expect) {
      throw new ContractError(`${method} ${url}: expected ${opts.expect}, got ${status}: ${JSON.stringify(body).slice(0, 300)}`)
    }
    this.checkContract(method, fullTemplate, status, body, contentType)
    return { status, body, headers: raw.headers(), raw }
  }

  private checkContract(method: Method, template: string, status: number, body: unknown, contentType: string) {
    if (method === 'OPTIONS') return
    const op = spec.paths?.[template]?.[method.toLowerCase()]
    if (!op) throw new ContractError(`${method} ${template} is not in the OpenAPI document`)
    if (!op.responses?.[String(status)]) {
      throw new ContractError(`${method} ${template} returned ${status}, which the OpenAPI document does not declare (declared: ${Object.keys(op.responses).join(', ')})`)
    }
    const v = validatorFor(template, method, status)
    if (v && contentType.includes('application/json') && !v(body)) {
      throw new ContractError(`${method} ${template} ${status} body does not match the published schema: ${ajv.errorsText(v.errors)}\n${JSON.stringify(body).slice(0, 400)}`)
    }
  }

  dispose = () => this.ctx.dispose()
}

function record(method: string, template: string) {
  mkdirSync(path.dirname(OPS_LOG), { recursive: true })
  appendFileSync(OPS_LOG, JSON.stringify({ op: `${method} ${template}` }) + '\n')
}

/** Every documented operation, excluding the docs endpoints themselves. */
export function allOperations(): string[] {
  const ops: string[] = []
  for (const [p, methods] of Object.entries(spec.paths as Record<string, Record<string, unknown>>)) {
    for (const m of Object.keys(methods)) ops.push(`${m.toUpperCase()} ${p}`)
  }
  return ops.sort()
}
