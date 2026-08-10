"use client";

import { useMemo, useState } from "react";
import type { PersonComment } from "@/lib/aggregate";

interface Thread {
  logEntryId: string;
  channel: string;
  date: string;
  comments: PersonComment[];
}

/**
 * Member-facing comment thread (§13d, extended to two-way by §16d, identity
 * verified by §20). Anyone logged in can reply — Author is their own
 * verified session identity, not a self-picked dropdown anymore. Edit/
 * delete only shows on a reply whose Author matches the session; the server
 * re-checks this independently (see /api/comments/[id]) rather than
 * trusting the button being hidden as real access control.
 */
export default function PersonCommentsModal({
  personName,
  comments: initialComments,
  sessionPerson,
  onClose,
}: {
  personName: string;
  comments: PersonComment[];
  sessionPerson: string;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<PersonComment[]>(initialComments);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busyThread, setBusyThread] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Stable per-entry metadata (channel/date never changes), used to
  // reconstruct full PersonComment objects after a thread refresh — the
  // refresh endpoint only returns comment fields, not the entry it's on.
  const threadMeta = useMemo(() => {
    const map = new Map<string, { channel: string; date: string }>();
    for (const c of initialComments) {
      if (!map.has(c.logEntryId)) map.set(c.logEntryId, { channel: c.channel, date: c.date });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const threads: Thread[] = useMemo(() => {
    const byEntry = new Map<string, PersonComment[]>();
    for (const c of comments) {
      const list = byEntry.get(c.logEntryId) ?? [];
      list.push(c);
      byEntry.set(c.logEntryId, list);
    }
    return [...byEntry.entries()]
      .map(([logEntryId, list]) => {
        const meta = threadMeta.get(logEntryId) ?? { channel: list[0]?.channel ?? "", date: list[0]?.date ?? "" };
        return {
          logEntryId,
          channel: meta.channel,
          date: meta.date,
          comments: [...list].sort((a, b) => (a.commentedAt ?? "").localeCompare(b.commentedAt ?? "")),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [comments, threadMeta]);

  async function refreshThread(logEntryId: string) {
    const res = await fetch(`/api/comments?logEntryId=${encodeURIComponent(logEntryId)}`);
    if (!res.ok) return;
    const json = await res.json();
    const meta = threadMeta.get(logEntryId);
    const refreshed: PersonComment[] = (json.comments as {
      id: string;
      comment: string;
      author: string | null;
      commentedAt: string | null;
    }[]).map((c) => ({
      id: c.id,
      comment: c.comment,
      author: c.author,
      channel: meta?.channel ?? "",
      date: meta?.date ?? "",
      logEntryId,
      commentedAt: c.commentedAt,
    }));
    setComments((prev) => [...prev.filter((c) => c.logEntryId !== logEntryId), ...refreshed]);
  }

  async function submitReply(logEntryId: string) {
    const text = (replyDrafts[logEntryId] ?? "").trim();
    if (!text) return;
    setBusyThread(logEntryId);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logEntryId, comment: text }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "Failed to send reply.");
      setReplyDrafts((prev) => ({ ...prev, [logEntryId]: "" }));
      await refreshThread(logEntryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reply.");
    } finally {
      setBusyThread(null);
    }
  }

  function startEdit(c: PersonComment) {
    setEditingId(c.id);
    setEditText(c.comment);
  }

  async function saveEdit(c: PersonComment) {
    if (!editText.trim()) return;
    setBusyThread(c.logEntryId);
    setError(null);
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(c.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: editText.trim() }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "Failed to save edit.");
      setEditingId(null);
      await refreshThread(c.logEntryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save edit.");
    } finally {
      setBusyThread(null);
    }
  }

  async function deleteReply(c: PersonComment) {
    if (!window.confirm("Delete this reply?")) return;
    setBusyThread(c.logEntryId);
    setError(null);
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(c.id)}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "Failed to delete.");
      await refreshThread(c.logEntryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setBusyThread(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-card bg-card sm:rounded-card"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="font-semibold text-ink">Comments for {personName}</h3>
          <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink">
            ✕
          </button>
        </div>

        <p className="border-b border-line px-5 py-3 text-sm text-ink-muted">
          Replying as <span className="font-medium text-ink">{sessionPerson}</span>
        </p>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 text-sm text-risk">{error}</p>}
          {threads.length === 0 ? (
            <p className="text-sm text-ink-muted">No comments yet.</p>
          ) : (
            <ul className="space-y-5">
              {threads.map((thread) => (
                <li key={thread.logEntryId} className="rounded-lg border border-line bg-page p-3">
                  <p className="mb-2 text-xs font-medium text-ink-muted">
                    {thread.channel} · {thread.date}
                  </p>
                  <ul className="space-y-2.5">
                    {thread.comments.map((c) => (
                      <li key={c.id} className="rounded-lg bg-card p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-ink">{c.author ?? "Admin"}</span>
                          {c.commentedAt && (
                            <span className="text-[11px] text-ink-muted">
                              {new Date(c.commentedAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {editingId === c.id ? (
                          <div className="mt-1.5">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={2}
                              className="w-full rounded-lg border border-line bg-page px-2 py-1.5 text-sm text-ink"
                            />
                            <div className="mt-1.5 flex gap-2">
                              <button
                                onClick={() => saveEdit(c)}
                                disabled={busyThread === c.logEntryId}
                                className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-ink">{c.comment}</p>
                        )}
                        {editingId !== c.id && c.author === sessionPerson && (
                          <div className="mt-1.5 flex gap-3">
                            <button
                              onClick={() => startEdit(c)}
                              className="text-[11px] font-medium text-accent hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteReply(c)}
                              className="text-[11px] font-medium text-risk hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-2.5 flex gap-2">
                    <input
                      value={replyDrafts[thread.logEntryId] ?? ""}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({ ...prev, [thread.logEntryId]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitReply(thread.logEntryId);
                      }}
                      placeholder="Reply…"
                      className="h-9 flex-1 rounded-lg border border-line bg-card px-2.5 text-sm text-ink focus:border-accent focus:outline-none"
                    />
                    <button
                      onClick={() => submitReply(thread.logEntryId)}
                      disabled={busyThread === thread.logEntryId || !(replyDrafts[thread.logEntryId] ?? "").trim()}
                      className="rounded-lg bg-accent px-3 text-sm font-medium text-white disabled:opacity-60"
                    >
                      Send
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
