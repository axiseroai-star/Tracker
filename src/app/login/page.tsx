"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { avatarColorForName } from "@/lib/constants";
import { getInitials } from "@/lib/aggregate";

interface LoginPerson {
  name: string;
  hasPin: boolean;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [people, setPeople] = useState<LoginPerson[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LoginPerson | null>(null);

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/people")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load the team list.");
        return res.json();
      })
      .then((json) => setPeople(json.people))
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load."));
  }, []);

  function selectPerson(p: LoginPerson) {
    setSelected(p);
    setPin("");
    setConfirmPin("");
    setError(null);
  }

  function backToNames() {
    setSelected(null);
    setPin("");
    setConfirmPin("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selected.name,
          pin,
          confirmPin: selected.hasPin ? undefined : confirmPin,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      router.push(searchParams.get("next") || "/");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const isCreating = selected && !selected.hasPin;
  const canSubmit =
    selected &&
    /^\d{4,6}$/.test(pin) &&
    (!isCreating || (/^\d{4,6}$/.test(confirmPin) && confirmPin === pin));

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-8">
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-6 sm:p-8">
        <h1 className="text-xl font-bold text-ink">Axisero Output Tracker</h1>

        {!selected && (
          <>
            <p className="mt-1 text-sm text-ink-muted">Who&apos;s logging in?</p>
            {loadError && <p className="mt-4 text-sm text-risk">{loadError}</p>}
            {!people && !loadError && (
              <div className="mt-6 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton h-12 rounded-lg" />
                ))}
              </div>
            )}
            {people && people.length === 0 && (
              <p className="mt-4 text-sm text-ink-muted">
                No active team members yet — ask an admin to add one.
              </p>
            )}
            {people && people.length > 0 && (
              <div className="mt-6 space-y-2">
                {people.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => selectPerson(p)}
                    className="flex h-12 w-full items-center gap-3 rounded-lg border border-line bg-page px-3 text-left text-base text-ink hover:border-accent"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: avatarColorForName(p.name) }}
                      aria-hidden
                    >
                      {getInitials(p.name)}
                    </span>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {selected && (
          <>
            <button
              onClick={backToNames}
              className="mt-3 text-sm font-medium text-ink-muted hover:text-ink"
            >
              ← Not {selected.name}?
            </button>
            <p className="mt-3 text-sm text-ink-muted">
              {isCreating
                ? `Create a PIN for ${selected.name} — you'll use it every time you log in.`
                : `Enter your PIN, ${selected.name}.`}
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="pin" className="mb-1.5 block text-sm font-medium text-ink">
                  {isCreating ? "New PIN (4-6 digits)" : "PIN"}
                </label>
                <input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  className="h-12 w-full rounded-lg border border-line bg-page px-3 text-center text-lg tracking-[0.3em] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
              {isCreating && (
                <div>
                  <label
                    htmlFor="confirmPin"
                    className="mb-1.5 block text-sm font-medium text-ink"
                  >
                    Confirm PIN
                  </label>
                  <input
                    id="confirmPin"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                    className="h-12 w-full rounded-lg border border-line bg-page px-3 text-center text-lg tracking-[0.3em] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </div>
              )}
              {error && <p className="text-sm text-risk">{error}</p>}
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="flex h-12 w-full items-center justify-center rounded-lg bg-accent text-base font-semibold text-white disabled:opacity-60"
              >
                {submitting ? "Checking…" : isCreating ? "Create PIN & continue" : "Continue"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
