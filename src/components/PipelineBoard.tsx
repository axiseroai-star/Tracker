"use client";

import { Fragment, useMemo, useState } from "react";
import type { Role } from "@/lib/auth";
import type { Lead, LeadWithTouchToday, Touch, Transfer } from "@/lib/pipeline-db";
import {
  PIPELINE_STATUSES,
  TERMINAL_STATUSES,
  TRANSFERABLE_STATUSES,
  type PipelineStatus,
} from "@/lib/pipeline-constants";
import AddLeadForm from "./AddLeadForm";
import LogTouchForm from "./LogTouchForm";
import PipelineAnalytics from "./PipelineAnalytics";
import TransferLeadForm from "./TransferLeadForm";

export type { LeadWithTouchToday } from "@/lib/pipeline-db";

/**
 * Board columns / funnel stages — deliberately excludes "Not Interested"
 * (dead-end leads don't get a column, per product decision). Exported so
 * PipelineAnalytics's funnel counts the same five stages rather than
 * maintaining a second copy of this list.
 */
export const COLUMNS: PipelineStatus[] = ["New", "Contacted", "Replied", "Interested", "Handed Off"];

/**
 * UI-only colors per stage (distinct from lib/constants.ts STATUS, which
 * grades *attainment* — this grades pipeline stage). Greens/ambers/reds echo
 * that palette's semantics (good/caution/dead-end); the rest borrow hues
 * already used for avatars elsewhere in the app, for a consistent look.
 */
const STAGE_COLORS: Record<PipelineStatus, { color: string; soft: string }> = {
  New: { color: "#64748B", soft: "#F1F5F9" },
  Contacted: { color: "#2563EB", soft: "#EFF6FF" },
  Replied: { color: "#D97706", soft: "#FFFBEB" },
  Interested: { color: "#16A34A", soft: "#F0FDF4" },
  "Not Interested": { color: "#DC2626", soft: "#FEF2F2" },
  "Handed Off": { color: "#7C3AED", soft: "#F5F3FF" },
};

/**
 * Pure date-string arithmetic (no timezone lookups) — this is a display
 * nicety, not a business rule with per-person timezone stakes like
 * effectiveDate() in lib/aggregate.ts, so a plain UTC-midnight diff is fine.
 */
function daysSinceLabel(dateISO: string | null): string {
  if (!dateISO) return "No touches yet";
  const todayISO = new Date().toISOString().slice(0, 10);
  const diffDays = Math.round(
    (Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${dateISO}T00:00:00Z`)) / 86400000
  );
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

/** null = a pre-country-feature lead — display as "Unknown", never blank/undefined. "Other" surfaces the BD's typed-in name alongside it. */
function countryLabel(lead: Pick<Lead, "country" | "countryOther">): string {
  if (!lead.country) return "Unknown";
  if (lead.country === "Other") return `Other — ${lead.countryOther ?? "Unknown"}`;
  return lead.country;
}

function StageBadge({ status }: { status: PipelineStatus }) {
  const meta = STAGE_COLORS[status];
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color: meta.color, backgroundColor: meta.soft }}
    >
      {status}
    </span>
  );
}

export default function PipelineBoard({
  initialLeads,
  role,
  sessionPerson,
  channels,
  activePeople,
}: {
  initialLeads: LeadWithTouchToday[];
  /** Session role, passed down from the server page — same pattern AppShell.tsx uses for role-based rendering. */
  role: Role;
  sessionPerson: string;
  /** This BD's own currently-loggable channels (§18b) — for the "Add lead" form. */
  channels: string[];
  /** Every active person, sorted alphabetically — the Transfer form's "pick a new owner" dropdown source of truth. */
  activePeople: string[];
}) {
  const isAdmin = role === "admin";

  const [leads, setLeads] = useState(initialLeads);
  const [scope, setScope] = useState<"mine" | "all" | "needsTakeover">("mine");
  const [groupBy, setGroupBy] = useState<"stage" | "person">("stage");
  const [viewMode, setViewMode] = useState<"board" | "table">("board");
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Reuses the exact "Interested" condition the Take Over button itself
  // gates on (see LeadDetail below) — a lead "needs takeover" precisely
  // when that button would be showing for it, no separate status check.
  const needsTakeoverCount = useMemo(
    () => leads.filter((l) => l.status === "Interested").length,
    [leads]
  );

  const visibleLeads = useMemo(() => {
    if (scope === "mine") return leads.filter((l) => l.owner === sessionPerson);
    if (scope === "needsTakeover") return leads.filter((l) => l.status === "Interested");
    return leads;
  }, [leads, scope, sessionPerson]);

  // Board columns: either the fixed pipeline stages, or one column per
  // distinct owner among the currently visible leads (sorted alphabetically,
  // same ordering convention DashboardClient's "Name" sort uses). In "My
  // leads" scope there's only ever one owner, so the person grouping is a
  // no-op single column — intentionally, rather than hiding the toggle.
  // Both groupings exclude "Not Interested" leads, same as the board always
  // has — dead-end leads don't get a board column at all; Table view (below)
  // is where they're still visible, since that view exists for scanning
  // everything at once.
  const boardLeads = useMemo(
    () => visibleLeads.filter((l) => l.status !== "Not Interested"),
    [visibleLeads]
  );

  const columns = useMemo(() => {
    if (groupBy === "stage") return COLUMNS as readonly string[];
    const owners = new Set(boardLeads.map((l) => l.owner));
    return [...owners].sort((a, b) => a.localeCompare(b));
  }, [groupBy, boardLeads]);

  const leadsByColumn = useMemo(() => {
    const map = new Map<string, LeadWithTouchToday[]>();
    for (const column of columns) map.set(column, []);
    for (const lead of boardLeads) {
      const key = groupBy === "stage" ? lead.status : lead.owner;
      map.get(key)?.push(lead);
    }
    return map;
  }, [columns, groupBy, boardLeads]);

  function handleLeadCreated(lead: Lead) {
    setLeads((prev) => [
      { ...lead, hasTouchToday: false, touchToday: null, lastTouchDate: null, transfers: [] },
      ...prev,
    ]);
    setShowAddForm(false);
  }

  function handleTouchLogged(result: { touch: Touch; lead: Lead }) {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === result.lead.id
          ? { ...l, ...result.lead, hasTouchToday: true, touchToday: result.touch, lastTouchDate: result.touch.date }
          : l
      )
    );
  }

  function handleTransferred(result: { lead: Lead; transfer: Transfer }) {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === result.lead.id
          ? { ...l, ...result.lead, transfers: [result.transfer, ...l.transfers] }
          : l
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

  async function handleArchive(leadId: number) {
    // Simple browser confirm, same pattern CommentPanel.tsx already uses for
    // its own delete action — a soft-delete is still irreversible from the
    // UI's point of view (no restore path), so it still needs a confirm step.
    if (!window.confirm("Delete this lead? This can't be undone.")) return;
    try {
      const res = await fetch(`/api/pipeline/leads/${leadId}/archive`, { method: "POST" });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "Failed to delete lead.");
      // Archived leads never come back from GET /api/pipeline/leads — drop
      // the card from the board immediately rather than waiting on a refetch.
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete lead.");
    }
  }

  function toggleExpanded(leadId: number) {
    setExpandedId((prev) => (prev === leadId ? null : leadId));
  }

  return (
    <div>
      <PipelineAnalytics leads={leads} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-card p-1">
            {(
              isAdmin ? (["mine", "all", "needsTakeover"] as const) : (["mine", "all"] as const)
            ).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                  scope === s ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink"
                }`}
              >
                {s === "mine" ? "My leads" : s === "all" ? "All leads" : "Needs takeover"}
                {s === "needsTakeover" && (
                  <span className="text-xs text-ink-muted">{needsTakeoverCount}</span>
                )}
              </button>
            ))}
          </div>
          {viewMode === "board" && (
            <div className="inline-flex rounded-lg border border-line bg-card p-1">
              {(["stage", "person"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroupBy(g)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    groupBy === g ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {g === "stage" ? "By stage" : "By person"}
                </button>
              ))}
            </div>
          )}
          <div className="inline-flex rounded-lg border border-line bg-card p-1">
            {(["board", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewMode(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  viewMode === v ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink"
                }`}
              >
                {v === "board" ? "Board" : "Table"}
              </button>
            ))}
          </div>
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

      {viewMode === "board" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          {columns.map((column) => {
            const columnLeads = leadsByColumn.get(column) ?? [];
            return (
              <div key={column} className="min-w-0">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">{column}</h2>
                  <span className="text-xs text-ink-muted">{columnLeads.length}</span>
                </div>
                <div className="space-y-2">
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
                      isAdmin={isAdmin}
                      activePeople={activePeople}
                      expanded={expandedId === lead.id}
                      onToggle={() => toggleExpanded(lead.id)}
                      onTouchLogged={handleTouchLogged}
                      onTakeOver={() => handleTakeOver(lead.id)}
                      onArchive={() => handleArchive(lead.id)}
                      onTransferred={handleTransferred}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <PipelineTable
          leads={visibleLeads}
          role={role}
          sessionPerson={sessionPerson}
          activePeople={activePeople}
          expandedId={expandedId}
          onToggle={toggleExpanded}
          onTouchLogged={handleTouchLogged}
          onTakeOver={handleTakeOver}
          onArchive={handleArchive}
          onTransferred={handleTransferred}
        />
      )}
    </div>
  );
}

/** Compact single-line card; clicking it expands the full detail in place. */
function LeadCard({
  lead,
  isOwner,
  isAdmin,
  activePeople,
  expanded,
  onToggle,
  onTouchLogged,
  onTakeOver,
  onArchive,
  onTransferred,
}: {
  lead: LeadWithTouchToday;
  isOwner: boolean;
  isAdmin: boolean;
  activePeople: string[];
  expanded: boolean;
  onToggle: () => void;
  onTouchLogged: (result: { touch: Touch; lead: Lead }) => void;
  onTakeOver: () => void;
  onArchive: () => void;
  onTransferred: (result: { lead: Lead; transfer: Transfer }) => void;
}) {
  return (
    <div className="rounded-card border border-line bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{lead.name}</span>
        <span className="hidden shrink-0 text-xs text-ink-muted sm:inline">{lead.owner}</span>
        <StageBadge status={lead.status} />
        <span className="hidden shrink-0 text-[11px] text-ink-muted md:inline">
          {daysSinceLabel(lead.lastTouchDate)}
        </span>
        <span className="shrink-0 text-ink-muted">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div className="border-t border-line px-3 pb-3 pt-2">
          <LeadDetail
            lead={lead}
            isOwner={isOwner}
            isAdmin={isAdmin}
            activePeople={activePeople}
            onTouchLogged={onTouchLogged}
            onTakeOver={onTakeOver}
            onArchive={onArchive}
            onTransferred={onTransferred}
          />
        </div>
      )}
    </div>
  );
}

/** Full detail — source, proof link, contact info, notes, take-over, delete, transfer, transfer history, and the log-touch form. Shared by board cards and table rows. */
function LeadDetail({
  lead,
  isOwner,
  isAdmin,
  activePeople,
  onTouchLogged,
  onTakeOver,
  onArchive,
  onTransferred,
}: {
  lead: LeadWithTouchToday;
  isOwner: boolean;
  isAdmin: boolean;
  activePeople: string[];
  onTouchLogged: (result: { touch: Touch; lead: Lead }) => void;
  onTakeOver: () => void;
  onArchive: () => void;
  onTransferred: (result: { lead: Lead; transfer: Transfer }) => void;
}) {
  const isTerminal = (TERMINAL_STATUSES as readonly string[]).includes(lead.status);
  const canManage = isOwner || isAdmin;
  // Transfer is open to everyone regardless of ownership (confirmed with
  // the CEO) — the only gate here is the lead's status, same pattern as
  // Take Over's own visibility being conditional on status below.
  const canTransfer = (TRANSFERABLE_STATUSES as readonly string[]).includes(lead.status);

  return (
    <div>
      <p className="text-xs text-ink-muted">
        {lead.source} · {lead.contactChannel}
        {!isOwner && ` · Owner: ${lead.owner}`}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">Country: {countryLabel(lead)}</p>

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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isAdmin && lead.status === "Interested" && (
          <button
            type="button"
            onClick={onTakeOver}
            className="flex h-9 flex-1 items-center justify-center rounded-lg border border-accent text-sm font-semibold text-accent hover:bg-accent-soft"
          >
            Take over
          </button>
        )}
        {canManage && (
          <button
            type="button"
            onClick={onArchive}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink-muted hover:border-risk/40 hover:text-risk"
          >
            🗑 Delete
          </button>
        )}
      </div>

      {canTransfer && (
        <TransferLeadForm
          leadId={lead.id}
          candidates={activePeople.filter((p) => p !== lead.owner)}
          onTransferred={onTransferred}
        />
      )}

      {isOwner && !isTerminal && (
        <LogTouchForm leadId={lead.id} touchToday={lead.touchToday} onLogged={onTouchLogged} />
      )}

      {lead.transfers.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1.5 text-xs font-medium text-ink-muted">Transfer history</p>
          <ul className="space-y-1.5">
            {lead.transfers.map((t) => (
              <li key={t.id} className="rounded-lg bg-page p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">
                    {t.fromOwner} → {t.toOwner}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-muted">
                    {new Date(t.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-0.5 text-ink-muted">
                  by {t.transferredBy}
                  {t.note && <> — “{t.note}”</>}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type SortKey = "name" | "owner" | "status" | "source" | "lastTouch";

/** Flat, sortable/filterable table — ignores the stage/person board grouping; Stage and Owner are just sortable/filterable columns instead. */
function PipelineTable({
  leads,
  role,
  sessionPerson,
  activePeople,
  expandedId,
  onToggle,
  onTouchLogged,
  onTakeOver,
  onArchive,
  onTransferred,
}: {
  leads: LeadWithTouchToday[];
  role: Role;
  sessionPerson: string;
  activePeople: string[];
  expandedId: number | null;
  onToggle: (leadId: number) => void;
  onTouchLogged: (result: { touch: Touch; lead: Lead }) => void;
  onTakeOver: (leadId: number) => void;
  onArchive: (leadId: number) => void;
  onTransferred: (result: { lead: Lead; transfer: Transfer }) => void;
}) {
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastTouch");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const owners = useMemo(
    () => [...new Set(leads.map((l) => l.owner))].sort((a, b) => a.localeCompare(b)),
    [leads]
  );

  const filtered = useMemo(
    () =>
      leads.filter(
        (l) => (ownerFilter === "all" || l.owner === ownerFilter) && (stageFilter === "all" || l.status === stageFilter)
      ),
    [leads, ownerFilter, stageFilter]
  );

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "owner":
          return dir * a.owner.localeCompare(b.owner);
        case "status":
          return (
            dir *
            (PIPELINE_STATUSES.indexOf(a.status) - PIPELINE_STATUSES.indexOf(b.status))
          );
        case "source":
          return dir * a.source.localeCompare(b.source);
        case "lastTouch":
          return dir * (a.lastTouchDate ?? "").localeCompare(b.lastTouchDate ?? "");
      }
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (key !== sortKey) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="h-9 rounded-lg border border-line bg-card px-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        >
          <option value="all">All owners</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="h-9 rounded-lg border border-line bg-card px-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        >
          <option value="all">All stages</option>
          {PIPELINE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-muted">{sorted.length} leads</span>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              {(
                [
                  ["name", "Name"],
                  ["owner", "Owner"],
                  ["status", "Stage"],
                  ["source", "Source"],
                  ["lastTouch", "Last touch"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th key={key} className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    className="hover:text-ink"
                  >
                    {label}
                    {sortIndicator(key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-ink-muted">
                  No leads match these filters.
                </td>
              </tr>
            )}
            {sorted.map((lead) => (
              <Fragment key={lead.id}>
                <tr
                  onClick={() => onToggle(lead.id)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-page"
                >
                  <td className="px-3 py-2 font-medium text-ink">{lead.name}</td>
                  <td className="px-3 py-2 text-ink-muted">{lead.owner}</td>
                  <td className="px-3 py-2">
                    <StageBadge status={lead.status} />
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{lead.source}</td>
                  <td className="px-3 py-2 text-ink-muted">{daysSinceLabel(lead.lastTouchDate)}</td>
                </tr>
                {expandedId === lead.id && (
                  <tr className="border-b border-line last:border-0 bg-page">
                    <td colSpan={5} className="px-3 py-3">
                      <LeadDetail
                        lead={lead}
                        isOwner={lead.owner === sessionPerson}
                        isAdmin={role === "admin"}
                        activePeople={activePeople}
                        onTouchLogged={onTouchLogged}
                        onTakeOver={() => onTakeOver(lead.id)}
                        onArchive={() => onArchive(lead.id)}
                        onTransferred={onTransferred}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
