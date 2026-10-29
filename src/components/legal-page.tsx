import { Link } from "@tanstack/react-router";
import ascendOsWhite from "@/assets/ascendos-stacked-white.png";
import ascendOsBlack from "@/assets/ascendos-stacked-black.png";

/**
 * Shell for the public legal documents.
 *
 * These are reachable without a session on purpose: Google's OAuth review
 * fetches the privacy policy URL directly, and an applicant deciding whether to
 * hand over a photo has not signed in yet. Anything behind the auth gate would
 * read as a 404 to both.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link to="/welcome" className="mb-8 inline-flex items-center">
          <img
            src={ascendOsWhite}
            alt="AscendOS"
            className="theme-logo-dark h-10 w-auto object-contain"
          />
          <img
            src={ascendOsBlack}
            alt="AscendOS"
            className="theme-logo-light h-10 w-auto object-contain"
          />
        </Link>

        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated {updated}</p>

        <div className="legal-prose mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>

        <div className="mt-12 flex gap-4 border-t border-border pt-6 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            Terms of Service
          </Link>
          <Link to="/welcome" className="hover:text-foreground">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Section heading + body, so every clause in both documents is spaced and
 *  weighted identically without each one repeating the classes. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{heading}</h2>
      {children}
    </section>
  );
}
