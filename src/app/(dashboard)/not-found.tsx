import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
        <Compass className="h-8 w-8" />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-slate-900">We can&apos;t find that record</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        It may have been deleted, or the link you followed might be broken.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-10 items-center rounded-xl bg-indigo-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
