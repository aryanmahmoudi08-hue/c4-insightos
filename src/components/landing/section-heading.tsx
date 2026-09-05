import type { ReactNode } from "react";
import { FadeUp } from "@/components/landing/reveal";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <FadeUp className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="display-serif mt-3 text-3xl leading-tight sm:text-4xl">{title}</h2>
      {description && (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{description}</p>
      )}
    </FadeUp>
  );
}
