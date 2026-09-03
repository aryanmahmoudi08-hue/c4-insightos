import { describe, expect, it } from "vitest";
import { validateTwilioSignature } from "./twilio-signature";

describe("Twilio signature validation", () => {
  const token = "12345";
  const url = "https://example.com/twilio";
  const payload = { CallSid: "CA123", CallStatus: "initiated" };
  const validSignature = "XKpEqbLy70iVfzCx++1ox9fvxp8=";

  it("accepts the known Twilio HMAC-SHA1 signature vector", async () => {
    await expect(validateTwilioSignature(token, validSignature, url, payload)).resolves.toBe(true);
  });

  it("rejects an invalid or missing signature", async () => {
    await expect(validateTwilioSignature(token, "invalid", url, payload)).resolves.toBe(false);
    await expect(validateTwilioSignature(token, "", url, payload)).resolves.toBe(false);
  });

  it("canonicalizes form keys deterministically", async () => {
    await expect(
      validateTwilioSignature(token, validSignature, url, {
        CallStatus: "initiated",
        CallSid: "CA123",
      }),
    ).resolves.toBe(true);
  });
});
