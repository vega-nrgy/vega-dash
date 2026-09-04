import Image from "next/image";
import { login } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? "/";

  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-grey-soft px-4">
      <div className="w-full max-w-sm rounded-input border border-hairline bg-paper p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <Image src="/vega-charge-logo.svg" alt="Vega Charge" width={160} height={42} priority />
        </div>

        <form action={login} className="space-y-4">
          <input type="hidden" name="next" value={next} />

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-[11px] font-medium text-ink">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-input border border-border bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-[11px] font-medium text-ink">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-input border border-border bg-white px-3 py-2 text-sm"
            />
          </div>

          {params.error && (
            <p className="text-xs text-red-600" role="alert">
              {params.error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-input bg-mint-deep px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
