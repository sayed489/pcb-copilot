import type { DesignResult } from '@/lib/design'
import { clientKeyFromRequest, createRateLimitStore } from '@/lib/rate-limit'
import { verifyRequestSchema } from '@/lib/schemas'
import { analyzeDesignRequest } from '@/lib/server/brief'
import { getServerConfig } from '@/lib/server/config'
import { compileAndVerify } from '@/lib/server/verification'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'
export const revalidate = 0

const rateLimit = createRateLimitStore({ max: 20, windowMs: 5 * 60_000, maxKeys: 2000 })

/**
 * POST /api/verify — compile + ERC/DRC a TSX module and return a full
 * DesignResult (including circuit JSON for the viewers).
 *
 * This is the server half of the browser-direct engine: the browser talks
 * to Fireworks itself (when the host network cannot), and only the heavy
 * tscircuit compile/verify step runs here.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8)
  const clientKey = clientKeyFromRequest(request)

  if (!rateLimit.allow(clientKey)) {
    return Response.json(
      { error: 'Too many verify requests. Wait a minute.', requestId },
      { status: 429, headers: { 'Retry-After': '60', 'X-Request-Id': requestId } },
    )
  }

  const parsed = verifyRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    rateLimit.rollback(clientKey)
    return Response.json(
      {
        error: 'Invalid verify request.',
        details: parsed.error.issues.slice(0, 3).map((i) => i.message),
        requestId,
      },
      { status: 400, headers: { 'X-Request-Id': requestId } },
    )
  }

  try {
    const verification = await compileAndVerify(parsed.data.tsx, {
      signal: request.signal,
      timeoutMs: 45_000,
    })

    let summary = parsed.data.summary
    let assumptions: string[] = []
    let model = parsed.data.model ?? 'browser-direct'

    // Optional: attach a real brief (only when a server key + URL are reachable)
    if (parsed.data.withBrief) {
      try {
        const config = getServerConfig()
        const brief = await analyzeDesignRequest(config, [parsed.data.summary], false, {
          signal: request.signal,
        })
        summary = brief.summary
        assumptions = brief.assumptions
        model = config.modelId
      } catch {
        // Brief enrichment is best-effort — verification stands on its own.
      }
    }

    const design: DesignResult = {
      tsx: parsed.data.tsx,
      circuitJson: verification.circuitJson,
      summary,
      assumptions,
      diagnostics: verification.diagnostics,
      stats: verification.stats,
      verified: verification.verified,
      iterations: 1,
      model,
      generatedAt: new Date().toISOString(),
    }

    return Response.json(
      { design, requestId },
      { headers: { 'X-Request-Id': requestId, 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return new Response(null, { status: 499, headers: { 'X-Request-Id': requestId } })
    }
    const message = error instanceof Error ? error.message : 'Verification failed.'
    return Response.json(
      { error: message, requestId },
      { status: 422, headers: { 'X-Request-Id': requestId } },
    )
  }
}
