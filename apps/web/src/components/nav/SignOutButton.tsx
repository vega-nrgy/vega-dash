import { logout } from "@/app/login/actions";

export function SignOutButton({ collapsed }: { collapsed: boolean }) {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-input border border-hairline py-2 text-xs text-muted hover:bg-grey-soft"
      >
        <span aria-hidden>⏻</span>
        {!collapsed && <span>Sign out</span>}
      </button>
    </form>
  );
}
