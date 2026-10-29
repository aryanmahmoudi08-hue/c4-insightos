import { Link } from "@tanstack/react-router";
import ascendOsWhite from "@/assets/ascendos-inline-white.png";
import ascendOsBlack from "@/assets/ascendos-inline-black.png";

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
        {/* h-10, not the h-4 this carried for the old wide wordmark: the
            AscendOS lockup stacks the mark above the text, so the wordmark is
            roughly a quarter of the asset's height rather than most of it. */}
        <div className="flex items-center gap-2">
          <img
            src={ascendOsWhite}
            alt="AscendOS"
            className="theme-logo-dark h-10 w-auto shrink-0 object-contain"
          />
          <img
            src={ascendOsBlack}
            alt="AscendOS"
            className="theme-logo-light h-10 w-auto shrink-0 object-contain"
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
          {/* Reachable from the public site, not only from the Google consent
              screen: a reviewer and an applicant both expect to find these
              without signing in. */}
          <Link to="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
            Privacy
          </Link>
          <Link to="/terms" className="text-sm text-muted-foreground hover:text-foreground">
            Terms
          </Link>
        </nav>
        <div className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} AscendOS. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
