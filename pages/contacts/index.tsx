"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import {
  Users, Plus, Search, Building2, Mail, Phone,
  MoreHorizontal, Pencil, Trash2, ArrowLeft, AlertCircle, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Contact, CreateContactInput } from "@/lib/types";
import { CRMLayout } from "@/components/crm/CRMLayout";

function getInitials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function ContactForm({
  defaultValues,
  onSubmit,
  onCancel,
  loading,
}: {
  defaultValues?: Partial<Contact>;
  onSubmit: (data: CreateContactInput) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<CreateContactInput>({
    first_name: defaultValues?.first_name ?? "",
    last_name: defaultValues?.last_name ?? "",
    email: defaultValues?.email ?? "",
    phone: defaultValues?.phone ?? "",
    title: defaultValues?.title ?? "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="first_name">First Name</Label>
          <Input
            id="first_name"
            value={form.first_name ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
            placeholder="John"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name">Last Name</Label>
          <Input
            id="last_name"
            value={form.last_name ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
            placeholder="Smith"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={form.email ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          placeholder="john@example.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          value={form.phone ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="+1-555-0100"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={form.title ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="VP of Engineering"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : defaultValues?.id ? "Save Changes" : "Create Contact"}
        </Button>
      </div>
    </form>
  );
}

export default function ContactsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/contacts?${params}`);
      const body = await res.json();
      if (body?.error) throw new Error(body.error);
      setContacts(Array.isArray(body?.contacts) ? body.contacts : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (status === "authenticated") {
      const t = setTimeout(fetchContacts, 300);
      return () => clearTimeout(t);
    }
  }, [status, fetchContacts]);

  const handleCreate = async (data: CreateContactInput) => {
    setSaving(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (body?.error) throw new Error(body.error);
      toast.success("Contact created");
      setShowCreate(false);
      fetchContacts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create contact");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: CreateContactInput) => {
    if (!editContact) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${editContact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (body?.error) throw new Error(body.error);
      toast.success("Contact updated");
      setEditContact(null);
      fetchContacts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update contact");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteContact) return;
    try {
      const res = await fetch(`/api/contacts/${deleteContact.id}`, { method: "DELETE" });
      const body = await res.json();
      if (body?.error) throw new Error(body.error);
      toast.success("Contact deleted");
      setDeleteContact(null);
      fetchContacts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete contact");
    }
  };

  return (
    <CRMLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contacts</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? "Loading…" : `${contacts.length} contact${contacts.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="size-4" /> New Contact
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search contacts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-destructive p-3 bg-red-50 rounded-lg border border-red-200 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Table */}
        <Card className="border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Company</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Phone</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Title</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><Skeleton className="h-4 w-40" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><Skeleton className="h-4 w-28" /></td>
                      <td className="px-4 py-3 hidden sm:table-cell"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-3" />
                    </tr>
                  ))
                ) : contacts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      <Users className="size-8 mx-auto mb-2 opacity-30" />
                      <p>No contacts found.</p>
                      <Button variant="link" className="mt-1 text-primary" onClick={() => setShowCreate(true)}>
                        Add your first contact
                      </Button>
                    </td>
                  </tr>
                ) : (
                  contacts.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/contacts/${c.id}`} className="flex items-center gap-2.5 group">
                          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                            {getInitials(c.first_name, c.last_name)}
                          </div>
                          <div>
                            <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                              {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                            </p>
                          </div>
                          <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                        </Link>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {c.company_name ? (
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Building2 className="size-3.5 shrink-0" />
                            {c.company_name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors">
                            <Mail className="size-3.5 shrink-0" />
                            {c.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {c.phone ? (
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Phone className="size-3.5 shrink-0" />
                            {c.phone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                        {c.title ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/contacts/${c.id}`)}>
                              <ChevronRight className="size-4 mr-2" /> View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditContact(c)}>
                              <Pencil className="size-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteContact(c)}
                            >
                              <Trash2 className="size-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Contact</DialogTitle>
            <DialogDescription>Add a new contact to your CRM.</DialogDescription>
          </DialogHeader>
          <ContactForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} loading={saving} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editContact} onOpenChange={(o) => !o && setEditContact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>Update contact information.</DialogDescription>
          </DialogHeader>
          {editContact && (
            <ContactForm
              defaultValues={editContact}
              onSubmit={handleEdit}
              onCancel={() => setEditContact(null)}
              loading={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteContact} onOpenChange={(o) => !o && setDeleteContact(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>{[deleteContact?.first_name, deleteContact?.last_name].filter(Boolean).join(" ")}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CRMLayout>
  );
}
