import type { NextApiRequest, NextApiResponse } from 'next';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth-helpers';
import type { Contact, UpdateContactInput, ApiError } from '@/lib/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ contact: Contact } | ApiError>
) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  const { id } = req.query as { id: string };

  // Fetch the contact (with joins)
  const fetchContact = async (): Promise<Contact | null> => {
    const rows = await query<Contact>(
      `SELECT c.*,
              co.name AS company_name,
              u.name  AS owner_name
       FROM contacts c
       LEFT JOIN companies co ON co.id = c.company_id
       LEFT JOIN users     u  ON u.id  = c.owner_id
       WHERE c.id = $1`,
      [id]
    );
    return rows[0] ?? null;
  };

  // ── GET /api/contacts/[id] ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const contact = await fetchContact();
      if (!contact) return res.status(404).json({ error: 'Contact not found' });

      // Sales reps can only view their own contacts
      if (user.role === 'sales_rep' && contact.owner_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      return res.status(200).json({ contact });
    } catch (err) {
      console.error('[GET /api/contacts/[id]]', err);
      return res.status(500).json({ error: 'Failed to fetch contact' });
    }
  }

  // ── PUT /api/contacts/[id] ─────────────────────────────────────────────────
  if (req.method === 'PUT') {
    try {
      const existing = await fetchContact();
      if (!existing) return res.status(404).json({ error: 'Contact not found' });

      // Sales reps can only edit their own contacts
      if (user.role === 'sales_rep' && existing.owner_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const body = req.body as UpdateContactInput;

      const rows = await query<Contact>(
        `UPDATE contacts
         SET first_name = COALESCE($1, first_name),
             last_name  = COALESCE($2, last_name),
             email      = COALESCE($3, email),
             phone      = COALESCE($4, phone),
             title      = COALESCE($5, title),
             company_id = COALESCE($6, company_id),
             owner_id   = COALESCE($7, owner_id),
             updated_at = now()
         WHERE id = $8
         RETURNING *`,
        [
          body.first_name ?? null,
          body.last_name ?? null,
          body.email ?? null,
          body.phone ?? null,
          body.title ?? null,
          body.company_id ?? null,
          // Sales reps cannot reassign ownership
          user.role === 'sales_rep' ? null : (body.owner_id ?? null),
          id,
        ]
      );

      return res.status(200).json({ contact: rows[0] });
    } catch (err) {
      console.error('[PUT /api/contacts/[id]]', err);
      return res.status(500).json({ error: 'Failed to update contact' });
    }
  }

  // ── DELETE /api/contacts/[id] ──────────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      // Only admin and manager can delete
      if (user.role === 'sales_rep') {
        return res.status(403).json({ error: 'Forbidden: insufficient role' });
      }

      const rows = await query<{ id: string }>(
        'DELETE FROM contacts WHERE id = $1 RETURNING id',
        [id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Contact not found' });

      return res.status(200).json({ contact: { id } as Contact });
    } catch (err) {
      console.error('[DELETE /api/contacts/[id]]', err);
      return res.status(500).json({ error: 'Failed to delete contact' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
