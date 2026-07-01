import type { NextApiRequest, NextApiResponse } from 'next';
import { runIntegration } from '@/lib/integrations/connectors';
import { requireUser } from '@/lib/auth-helpers';

interface GetDeploymentResult {
  ok: boolean;
  deployment: {
    id: string;
    url: string;
    state: string;
    name: string;
    target?: string;
    createdAt: number;
    readyAt?: number;
    errorMessage?: string;
  };
}

/**
 * GET /api/integrations/vercel/getdeployment?idOrUrl=<id>
 *
 * Retrieves a Vercel deployment by ID or URL.
 * Action: getdeployment → GET /v13/deployments/{idOrUrl}
 * Credentials: VERCEL_ACCESS_TOKEN (env_key_hints: VERCEL_ACCESS_TOKEN, VERCEL_TOKEN, VERCEL_OAUTH_TOKEN)
 * Auth type: bearer, credKey: 'access_token' → pass { access_token: token } to runIntegration
 *
 * Query params:
 *   idOrUrl  (required) — deployment ID or hostname
 *   teamId   (optional) — Vercel team ID
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDeploymentResult | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireUser(req);
  } catch {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  const { idOrUrl, teamId } = req.query as { idOrUrl?: string; teamId?: string };

  if (!idOrUrl) {
    return res.status(400).json({ error: 'idOrUrl query parameter is required' });
  }

  // Resolve Vercel token — env_key_hints: VERCEL_ACCESS_TOKEN, VERCEL_TOKEN, VERCEL_OAUTH_TOKEN
  // Provider auth: bearer, credKey: 'access_token' → must pass { access_token: token }
  const vercelToken =
    process.env.VERCEL_ACCESS_TOKEN ??
    process.env.VERCEL_TOKEN ??
    process.env.VERCEL_OAUTH_TOKEN ??
    '';

  if (!vercelToken) {
    return res.status(503).json({
      error:
        'Vercel access token is not configured. Set VERCEL_ACCESS_TOKEN in Workbench → Configure → Environment (or connect the Vercel integration in Workbench → Configure → Integrations).',
    });
  }

  try {
    const queryParams: Record<string, string> = {};
    if (teamId) queryParams.teamId = teamId;

    // IMPORTANT: Vercel provider uses bearer auth with credKey: 'access_token'
    // Must pass { access_token: token }, NOT { api_key: token }
    const result = await runIntegration(
      'vercel',
      {
        method: 'GET',
        endpoint: `v13/deployments/${encodeURIComponent(idOrUrl)}`,
        queryParams,
      },
      { access_token: vercelToken }
    );

    if (!result.success) {
      return res.status(result.statusCode || 502).json({
        error: result.errorMessage ?? 'Failed to fetch Vercel deployment',
      });
    }

    const data = result.data as Record<string, unknown>;

    return res.status(200).json({
      ok: true,
      deployment: {
        id: data.id as string,
        url: data.url as string,
        state: (data.readyState as string) ?? (data.status as string) ?? 'UNKNOWN',
        name: data.name as string,
        target: data.target as string | undefined,
        createdAt: data.createdAt as number,
        readyAt: data.readyAt as number | undefined,
        errorMessage: data.errorMessage as string | undefined,
      },
    });
  } catch (err) {
    console.error('[GET /api/integrations/vercel/getdeployment]', err);
    return res.status(500).json({ error: 'Failed to fetch Vercel deployment' });
  }
}
