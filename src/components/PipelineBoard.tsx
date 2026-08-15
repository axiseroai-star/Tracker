"use client";

import { useMemo, useState } from "react";
import type { Role } from "@/lib/auth";
import type { Lead, LeadWithTouchToday, Touch } from "@/lib/pipeline-db";
import { TERMINAL_STATUSES, type PipelineStatus } from "@/lib/pipeline-constants";
import AddLeadForm from "./AddLeadForm";
import LogTouchForm from "./LogTouchForm";

export type { LeadWithTouchToday } from "@/lib/pipeline-db";

/** Board columns — deliberately excludes "Not Interested" (dead-end leads don't get a column, per product decision). */
const COLUMNS: PipelineStatus[] = ["New", "Contacted", "Replied", "Interested", "Handed Off"];

export default function PipelineBoard({
  initialLeads,
  role,
  sessionPerson,
  channels,
}: {
  initialLeads: LeadWithTouchToday[];
  /** Session role, passed down from the server page — same pattern AppShell.tsx uses for role-based rendering. */
  role: Role;
  sessionPerson: string;
  /** This BD's own currently-loggable channels (§18b) — for the "Add lead" form. */
  channels: string[];
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [showAddForm, setShowAddForm] = useState(false);

  const visibleLeads = useMemo(
    () => (scope === "mine" ? leads.filter((l) => l.owner === sessionPerson) : leads),
    [leads, scope, sessionPerson]
  );

  const leadsByColumn = useMemo(() => {
    const map = new Map<PipelineStatus, LeadWithTouchToday[]>();
    for (const column of COLUMNS) map.set(column, []);
    for (const lead of visibleLeads) {
      map.get(lead.status)?.push(lead);
    }
    return map;
  }, [visibleLeads]);

  function handleLeadCreated(lead: Lead) {
    setLeads((prev) => [{ ...lead, hasTouchToday: false }, ...prev]);
    setShowAddForm(false);
  }

  function handleTouchLogged(result: { touch: Touch; lead: Lead }) {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === result.lead.id ? { ...result.lead, hasTouchToday: true } : l
      )
    );
  }

  async function handleTakeOver(leadId: number) {
    try {
      const res = await fetch(`/api/pipeline/leads/${leadId}/take-over`, { method: "POST" });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "Failed to take over lead.");
      setLeads((prev) =>
        prev.map((l) => (l.id === result.lead.id ? { ...l, ...result.lead } : l))
      );
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to take over lead.");
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-line bg-card p-1">
          {(["mine", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                scope === s ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink"
              }`}
            >
              {s === "mine" ? "My leads" : "All leads"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Add lead
        </button>
      </div>

      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-card bg-card p-5 sm:rounded-card sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-ink">Add lead</h3>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                aria-label="Close"
                className="text-ink-muted hover:text-ink"
              >
                ✕
              </button>
            </div>
            <AddLeadForm
              channels={channels}
              onCreated={handleLeadCreated}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {COLUMNS.map((column) => {
          const columnLeads = leadsByColumn.get(column) ?? [];
          return (
            <div key={column} className="min-w-0">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">{column}</h2>
                <span className="text-xs text-ink-muted">{columnLeads.length}</span>
              </div>
              <div className="space-y-3">
                {columnLeads.length === 0 && (
                  <div className="rounded-card border border-dashed border-line bg-card px-3 py-6 text-center text-xs text-ink-muted">
                    No leads
                  </div>
                )}
                {columnLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    isOwner={lead.owner === sessionPerson}
                    isAdmin={role === "admin"}
                    onTouchLogged={handleTouchLogged}
                    onTakeOver={() => handleTakeOver(lead.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  isOwner,
  isAdmin,
  onTouchLogged,
  onTakeOver,
}: {
  lead: LeadWithTouchToday;
  isOwner: boolean;
  isAdmin: boolean;
  onTouchLogged: (result: { touch: Touch; lead: Lead }) => void;
  onTakeOver: () => void;
}) {
  const isTerminal = (TERMINAL_STATUSES as readonly string[]).includes(lead.status);

  return (
    <div className="rounded-card border border-line bg-card p-4">
      <p className="font-semibold text-ink">{lead.name}</p>
      <p className="mt-0.5 text-xs text-ink-muted">
        {lead.source} · {lead.contactChannel}
      </p>
      {!isOwner && <p className="mt-1 text-xs text-ink-muted">Owner: {lead.owner}</p>}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <a
          href={lead.proofLink}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-line bg-page px-2 py-0.5 text-[11px] text-accent hover:opacity-80"
        >
          Proof link
        </a>
        <span className="rounded-full border border-line bg-page px-2 py-0.5 text-[11px] text-ink-muted">
          {lead.contactInfo}
        </span>
      </div>

      {lead.notes && <p className="mt-2 text-xs text-ink-muted">{lead.notes}</p>}

      {isAdmin && lead.status === "Interested" && (
        <button
          type="button"
          onClick={onTakeOver}
          className="mt-3 flex h-9 w-full items-center justify-center rounded-lg border border-accent text-sm font-semibold text-accent hover:bg-accent-soft"
        >
          Take over
        </button>
      )}

      {isOwner && !isTerminal && (
        <LogTouchForm leadId={lead.id} hasTouchToday={lead.hasTouchToday} onLogged={onTouchLogged} />
      )}
    </div>
  );
}
