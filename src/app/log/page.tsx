import Link from "next/link";
import EntryForm from "@/components/EntryForm";
import { getSession } from "@/lib/auth";

// Server Component: resolves role server-side (§14b — members get a locked,
// auto-filled date; admin keeps a fully editable one) rather than trusting
// anything the client claims about its own role.
export default async function LogPage() {
  const session = await getSession();
  const role = session?.role ?? "member";

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Log output</h1>
          <p className="text-sm text-ink-muted">Add today&apos;s numbers for a channel.</p>
        </div>
        <Link href="/" className="text-sm font-medium text-accent hover:underline">
          Dashboard →
        </Link>
      </div>
      <EntryForm role={role} />
    </main>
  );
}
