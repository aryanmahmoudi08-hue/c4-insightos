import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeUp } from "@/components/landing/reveal";

export function LandingCta() {
  return (
    <section className="border-t border-border py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-4 text-center md:px-6">
        <FadeUp amount={0.4}>
          <h2 className="display-serif text-3xl leading-tight sm:text-4xl md:text-5xl">
            Run the business from one operating system.
          </h2>
          <p className="mt-5 text-base text-muted-foreground md:text-lg">
            See what needs attention. Understand why. Know what happens next.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg">
              <Link to="/login">
                Access C4 OS
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
