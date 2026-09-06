import { Link } from "@tanstack/react-router";
import c4OsWhite from "@/assets/c4-os-white.png";
import c4OsBlack from "@/assets/c4-os-black.png";

const LINKS = [
  { href: "#platform", label: "Platform" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#intelligence", label: "Intelligence" },
  { href: "#faq", label: "FAQ" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 md:flex-row md:justify-between md:px-6">
        <div className="flex items-center gap-2">
          <img
            src={c4OsWhite}
            alt="C4 OS"
            className="theme-logo-dark h-7 w-auto shrink-0 object-contain"
          />
          <img
            src={c4OsBlack}
            alt="C4 OS"
            className="theme-logo-light h-7 w-auto shrink-0 object-contain"
          />
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-5">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        </nav>
        <div className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} C4 OS. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
