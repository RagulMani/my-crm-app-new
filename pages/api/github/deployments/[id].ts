import type { NextApiRequest, NextApiResponse } from 'next';
import { runIntegration } from '@/lib/integrations/connectors';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth-helpers';

interface GithubDeployment {
  id: string;
  repo_name: string;
  repo_full_name: string | null;
  repo_url: string | null;
  branch_name: string;
  github_repo_id: number | null;
  vercel_deployment_id: string | null;
  vercel_deployment_url: string | null;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  initiated_by: string | null;
  initiated_by_name: string | null;
  initiated_by_email: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * GET  /api/github/deployments/[id]  — fetch a single deployment record
 * POST /api/github/deployments/[id]  — refresh Vercel deployment status
 *
 * Auth: requireUser (any authenticated user)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query as { id: string };

  if (!id) {
    return res.status(400).json({ error: 'Deployment ID is required' });
  }

  try {
    await requireUser(req);
  } catch {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  // ── GET: fetch deployment record ──────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const rows = await query<GithubDeployment>(
        `SELECT
           gd.id,
           gd.repo_name,
           gd.repo_full_name,
           gd.repo_url,
           gd.branch_name,
           gd.github_repo_id,
           gd.vercel_deployment_id,
           gd.vercel_deployment_url,
           gd.status,
           gd.error_message,
           gd.metadata,
           gd.initiated_by,
           u.name AS initiated_by_name,
           u.email AS initiated_by_email,
           gd.created_at,
           gd.updated_at
         FROM github_deployments gd
         LEFT JOIN users u ON u.id = gd.initiated_by
         WHERE gd.id = $1`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Deployment not found' });
      }

      return res.status(200).json({ deployment: rows[0] });
    } catch (err) {
      console.error('[GET /api/github/deployments/[id]]', err);
      return res.status(500).json({ error: 'Failed to fetch deployment' });
    }
  }

  // ── POST: refresh Vercel deployment status ────────────────────────────────
  if (req.method === 'POST') {
    try {
      const rows = await query<GithubDeployment>(
        `SELECT * FROM github_deployments WHERE id = $1`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Deployment not found' });
      }

      const deployment = rows[0];

      if (!deployment.vercel_deployment_id) {
        return res.status(400).json({
          error: 'No Vercel deployment associated with this record',
        });
      }

      // Vercel token — provider auth: bearer, credKey: 'access_token'
      // Must pass { access_token: token }, NOT { api_key: token }
      const vercelToken =
        process.env.VERCEL_ACCESS_TOKEN ??
        process.env.VERCEL_TOKEN ??
        process.env.VERCEL_OAUTH_TOKEN ??
        '';

      if (!vercelToken) {
        return res.status(503).json({
          error:
            'Vercel access token is not configured. Set VERCEL_ACCESS_TOKEN in Workbench → Configure → Environment.',
        });
      }

      const vercelResult = await runIntegration(
        'vercel',
        {
          method: 'GET',
          endpoint: `v13/deployments/${encodeURIComponent(deployment.vercel_deployment_id)}`,
        },
        { access_token: vercelToken }
      );

      if (!vercelResult.success) {
        return res.status(vercelResult.statusCode || 502).json({
          error: vercelResult.errorMessage ?? 'Failed to fetch Vercel deployment status',
        });
      }

      const vd = vercelResult.data as Record<string, unknown>;
      const vercelState = (vd.readyState as string) ?? (vd.status as string) ?? 'UNKNOWN';

      // Map Vercel state to our internal status
      const statusMap: Record<string, string> = {
        READY: 'vercel_ready',
        ERROR: 'vercel_error',
        CANCELED: 'vercel_canceled',
        BUILDING: 'vercel_building',
        QUEUED: 'vercel_queued',
        INITIALIZING: 'vercel_building',
      };
      const newStatus = statusMap[vercelState] ?? 'vercel_unknown';

      // Update the deployment record
      await query(
        `UPDATE github_deployments
         SET status = $1,
             vercel_deployment_url = COALESCE($2, vercel_deployment_url),
             error_message = $3,
             updated_at = now()
         WHERE id = $4`,
        [
          newStatus,
          vd.url ? `https://${vd.url}` : null,
          vd.errorMessage as string | null ?? null,
          id,
        ]
      );

      // Re-fetch updated record
      const updatedRows = await query<GithubDeployment>(
        `SELECT
           gd.*,
           u.name AS initiated_by_name,
           u.email AS initiated_by_email
         FROM github_deployments gd
         LEFT JOIN users u ON u.id = gd.initiated_by
         WHERE gd.id = $1`,
        [id]
      );

      return res.status(200).json({
        deployment: updatedRows[0],
        vercel_state: vercelState,
        refreshed: true,
      });
    } catch (err) {
      console.error('[POST /api/github/deployments/[id]]', err);
      return res.status(500).json({ error: 'Failed to refresh deployment status' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
