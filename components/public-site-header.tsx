import Link from "next/link";

interface PublicSiteHeaderProps {
  active?: "home" | "templates";
}

const navLinks = [
  { label: "Templates", href: "/templates", key: "templates" },
  { label: "Agencies", href: "/instagram-dm-automation-agencies", key: "agencies" },
  { label: "Pricing", href: "/#pricing", key: "pricing" },
  { label: "Security", href: "/#security", key: "security" },
];

export default function PublicSiteHeader({ active }: PublicSiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/85">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="AutoReplies home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/oc-mark.svg" alt="" className="h-9 w-9" />
          <span className="font-display text-[13px] font-semibold uppercase leading-[1.1] tracking-[0.14em] text-white">
            Original<br />Copy Studio
          </span>
          <span className="ml-2 hidden border-l border-white/15 pl-3 text-sm font-semibold text-zinc-400 sm:inline">
            AutoReplies
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className={`text-sm font-medium transition ${
                active === link.key ? "text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:text-white sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center bg-[#F0A24A] px-4 py-2 text-sm font-bold text-[#141210] transition hover:bg-[#F7B96B]"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
