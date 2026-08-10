"use client";

import { useEffect, useState } from "react";

interface Comment {
  id: string;
  comment: string;
  visibleToPerson: boolean;
  commentedAt: string | null;
}

/** Modal comment thread for one Daily Log row (§13c) — admin only. */
export default function CommentPanel({
  logEntryId,
  title,
  onClose,
}: {
  logEntryId: string;
  title: string;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [visibleToPerson, setVisibleToPerson] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    fetch(`/api/admin/comments?logEntryId=${encodeURIComponent(logEntryId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load comments.");
        return res.json();
      })
      .then((json) => setComments(json.comments))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load comments."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logEntryId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logEntryId, comment: text.trim(), visibleToPerson }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "Failed to save comment.");
      setText("");
      setVisibleToPerson(true);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save comment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-card bg-card sm:rounded-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="font-semibold text-ink">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 text-sm text-risk">{error}</p>}
          {!comments && !error && <p className="text-sm text-ink-muted">Loading…</p>}
          {comments && comments.length === 0 && (
            <p className="text-sm text-ink-muted">No comments yet.</p>
          )}
          {comments && comments.length > 0 && (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg border border-line bg-page p-3">
                  <p className="text-sm text-ink">{c.comment}</p>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-muted">
                    {c.commentedAt && <span>{new Date(c.commentedAt).toLocaleString()}</span>}
                    <span
                      className={`rounded-full px-1.5 py-0.5 ${
                        c.visibleToPerson ? "bg-good-soft text-good" : "bg-none-soft text-none"
                      }`}
                    >
                      {c.visibleToPerson ? "Visible to person" : "Admin only"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-line p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Add a comment…"
            className="w-full rounded-lg border border-line bg-page px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                checked={visibleToPerson}
                onChange={(e) => setVisibleToPerson(e.target.checked)}
                className="h-4 w-4 rounded border-line"
              />
              Visible to person
            </label>
            <button
              type="submit"
              disabled={submitting || !text.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Add comment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
