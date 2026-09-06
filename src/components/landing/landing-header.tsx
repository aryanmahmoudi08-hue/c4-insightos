import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import c4OsWhite from "@/assets/c4-os-white.png";
import c4OsBlack from "@/assets/c4-os-black.png";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "#platform", label: "Platform" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#intelligence", label: "Intelligence" },
  { href: "#faq", label: "FAQ" },
];

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full transition-[background-color,border-color,padding] duration-300",
        scrolled
          ? "border-b border-border bg-background/80 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between px-4 transition-[height] duration-300 md:px-6",
          scrolled ? "h-14" : "h-16",
        )}
      >
        <a href="#top" className="flex min-w-0 items-center gap-2">
          <img
            src={c4OsWhite}
            alt="C4 OS"
            className="theme-logo-dark h-9 w-auto shrink-0 object-contain"
          />
          <img
            src={c4OsBlack}
            alt="C4 OS"
            className="theme-logo-light h-9 w-auto shrink-0 object-contain"
          />
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Button asChild size="sm">
            <Link to="/login">Access C4 OS</Link>
          </Button>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetTitle className="display-serif text-lg">C4 OS</SheetTitle>
            <nav className="mt-8 flex flex-col gap-5">
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href} className="text-base text-foreground/90">
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6">
              <Link to="/login" className="text-sm text-muted-foreground">
                Sign in
              </Link>
              <Button asChild className="w-full">
                <Link to="/login">Access C4 OS</Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
