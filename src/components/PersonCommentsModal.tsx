"use client";

import type { PersonComment } from "@/lib/aggregate";

/**
 * Member-facing, read-only view of a person's visible comments (§13d). No
 * edit/delete controls — those stay admin-only in /admin's CommentPanel.
 */
export default function PersonCommentsModal({
  personName,
  comments,
  onClose,
}: {
  personName: string;
  comments: PersonComment[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-card bg-card sm:rounded-card"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="font-semibold text-ink">Comments for {personName}</h3>
          <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {comments.length === 0 ? (
            <p className="text-sm text-ink-muted">No comments yet.</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg border border-line bg-page p-3">
                  <p className="text-xs font-medium text-ink-muted">
                    {c.channel} · {c.date}
                  </p>
                  <p className="mt-1 text-sm text-ink">{c.comment}</p>
                  {c.commentedAt && (
                    <p className="mt-1.5 text-[11px] text-ink-muted">
                      {new Date(c.commentedAt).toLocaleString()}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
