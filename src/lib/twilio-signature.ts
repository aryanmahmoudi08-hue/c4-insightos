export async function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  payload: Record<string, string>,
) {
  const canonical =
    url +
    Object.keys(payload)
      .sort()
      .map((key) => `${key}${payload[key]}`)
      .join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical));
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed)));
  const expectedBytes = new TextEncoder().encode(expected);
  const providedBytes = new TextEncoder().encode(signature);
  if (expectedBytes.length !== providedBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= expectedBytes[index] ^ providedBytes[index];
  }
  return difference === 0;
}
