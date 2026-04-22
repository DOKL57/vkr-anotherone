import crypto from "node:crypto";

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  toleranceSec: number
) {
  if (!initData || !botToken) {
    return null;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const userRaw = params.get("user");

  if (!hash || !authDate || !userRaw) {
    return null;
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - authDate);
  if (age > toleranceSec) {
    return null;
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const signature = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  if (signature !== hash) {
    return null;
  }

  return JSON.parse(userRaw) as {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
}
