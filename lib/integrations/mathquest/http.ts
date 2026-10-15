import "server-only";
import { receiverOrigin } from "./config";
export class ReceiverError extends Error {
  constructor(
    public code: string,
    public retryable: boolean,
    public retryAfter = 0,
  ) {
    super(code);
  }
}
export async function receiverRequest(
  path: "ingest-scansob-results" | "pair-scansob-workspace",
  body: string,
  token?: string,
) {
  const origin = receiverOrigin();
  let response: Response;
  try {
    response = await fetch(`${origin}/functions/v1/${path}`, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    });
  } catch {
    throw new ReceiverError("RECEIVER_UNAVAILABLE", true);
  }
  if (!response.ok) {
    // Only this bounded, documented code can be distinguished from denial.
    // Never persist or return an arbitrary receiver error body.
    if (
      path === "ingest-scansob-results" &&
      response.status === 403 &&
      response.headers.get("content-type")?.includes("application/json")
    ) {
      try {
        const value = await boundedJson(response, 2048);
        if (
          value &&
          typeof value === "object" &&
          Object.keys(value).length === 1 &&
          "error" in value &&
          value.error === "TERM_CLOSED"
        )
          throw new ReceiverError("TERM_CLOSED", false);
      } catch (error) {
        if (
          error instanceof ReceiverError &&
          (error.code === "TERM_CLOSED" ||
            error.code === "RECEIVER_UNAVAILABLE")
        )
          throw error;
      }
    } else await response.body?.cancel();
    const retryable = response.status === 429 || response.status >= 500;
    const code =
      response.status === 401 || response.status === 403
        ? "CONNECTION_DENIED"
        : response.status === 409
          ? "RECEIVER_CONFLICT"
          : retryable
            ? "RECEIVER_UNAVAILABLE"
            : "RECEIVER_REJECTED";
    const wait = Number(response.headers.get("retry-after"));
    throw new ReceiverError(
      code,
      retryable,
      Number.isFinite(wait) ? Math.min(Math.max(wait, 0), 3600) : 0,
    );
  }
  if (
    response.status !== 200 ||
    !response.headers.get("content-type")?.includes("application/json")
  ) {
    await response.body?.cancel();
    throw new ReceiverError("INVALID_ACK", false);
  }
  return boundedJson(response, 65536);
}
async function boundedJson(
  response: Response,
  limit: number,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ReceiverError("INVALID_ACK", false);
  let size = 0,
    content = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ReceiverError("INVALID_ACK", false);
      }
      content += decoder.decode(part.value, { stream: true });
    }
    content += decoder.decode();
  } catch (error) {
    if (error instanceof ReceiverError) throw error;
    // A connection can fail after headers arrive. Retry the same frozen event;
    // the receiver's event id deduplicates a commit whose acknowledgment was lost.
    throw new ReceiverError("RECEIVER_UNAVAILABLE", true);
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new ReceiverError("INVALID_ACK", false);
  }
}
