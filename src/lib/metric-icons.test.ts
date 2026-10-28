import { describe, expect, it } from "vitest";
import {
  BadgeDollarSign,
  CalendarCheck,
  CircleDollarSign,
  Eye,
  Flame,
  Percent,
  PhoneCall,
  Megaphone,
  Repeat,
  Users,
  Activity,
  UserCheck,
} from "lucide-react";
import { metricIconFor } from "./metric-icons";

describe("metricIconFor", () => {
  it("prefers an exact label over the pattern table", () => {
    // "Closes" would also match the /\bclos/ stem; the exact entry wins and
    // both happen to agree, but "Average Call Length" does not — the exact
    // entry maps it to a clock, the stem table would reach /\bcall/ first.
    expect(metricIconFor("Closes")).toBe(Flame);
    expect(metricIconFor("Average Call Length")).not.toBe(PhoneCall);
  });

  it("anchors at a word start, so an inner match never wins", () => {
    // The bug this table exists to prevent: "generated" contains "rate".
    expect(metricIconFor("Total Revenue Generated")).toBe(CircleDollarSign);
    // ...and "broadcast" contains "ad", which must not reach the ad-spend
    // megaphone. A real ad metric still does, by its own leading word.
    expect(metricIconFor("Broadcast Reach")).toBe(Eye);
    expect(metricIconFor("Ad Spend")).toBe(Megaphone);
  });

  it("covers a stem's inflections", () => {
    expect(metricIconFor("New Leads")).toBe(Users);
    expect(metricIconFor("Lead")).toBe(Users);
    expect(metricIconFor("Unique Viewers")).toBe(Eye);
    expect(metricIconFor("Calls Booked")).toBe(CalendarCheck);
  });

  it("reads a rate as a rate, whatever it is a rate of", () => {
    expect(metricIconFor("Close Rate")).toBe(Percent);
    expect(metricIconFor("Show Rate")).toBe(Percent);
    expect(metricIconFor("Cash Collection Rate")).toBe(Percent);
    expect(metricIconFor("Engagement Rate")).toBe(Percent);
  });

  it("recognises the acronyms this product actually uses", () => {
    expect(metricIconFor("MRR — Low Ticket")).toBe(Repeat);
    expect(metricIconFor("High Ticket Active")).toBe(BadgeDollarSign);
  });

  it("matches case-insensitively", () => {
    expect(metricIconFor("TOTAL CASH COLLECTED")).toBe(CircleDollarSign);
    expect(metricIconFor("showed")).toBe(UserCheck);
  });

  it("falls back to a neutral mark rather than guessing", () => {
    expect(metricIconFor("Widgets Per Fortnight")).toBe(Activity);
    expect(metricIconFor("")).toBe(Activity);
  });
});
