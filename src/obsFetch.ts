/**
 * Network helpers that work around the platform differences of Obsidian's webviews.
 *
 * The desktop app (Electron) and the Android app (Chromium WebView) can issue
 * cross-origin `fetch()` calls to cloud APIs without trouble. The iOS/iPadOS app
 * runs inside WKWebView, where the page origin is a custom scheme
 * (`capacitor://` / `app://obsidian.md`). WebKit refuses cross-origin requests
 * from such origins and rejects the promise with a plain `TypeError` whose
 * message is literally "Load failed", which then bubbles up and is shown to the
 * user as a `Load failed` notice when a sync starts.
 *
 * Obsidian's own `requestUrl` is implemented natively and is not subject to CORS,
 * so on iOS we route everything through it.
 */

import { Platform, requestUrl } from "obsidian";

/**
 * A `fetch`-compatible wrapper on top of Obsidian's `requestUrl`, hence not
 * subject to CORS.
 */
export const obsidianFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const url =
    typeof input === "string" ? input : (input as any).url || input.toString();
  const method = init?.method || "GET";

  const headers: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) {
        headers[key] = value;
      }
    } else {
      for (const key of Object.keys(init.headers)) {
        headers[key] = (init.headers as any)[key];
      }
    }
  }

  let body = init?.body;
  let contentType: string | undefined = undefined;

  if (
    body instanceof URLSearchParams ||
    (body &&
      typeof body === "object" &&
      ((body as any).constructor?.name === "URLSearchParams" ||
        Object.prototype.toString.call(body) === "[object URLSearchParams]"))
  ) {
    body = (body as any).toString();
    headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
  }

  if (headers["content-type"] || headers["Content-Type"]) {
    contentType = headers["content-type"] || headers["Content-Type"];
  }

  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    if (ArrayBuffer.isView(body)) {
      body = body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength
      );
    }
  } else if (body instanceof Blob) {
    body = await body.arrayBuffer();
  }

  const res = await requestUrl({
    url: url,
    method: method,
    headers: headers,
    body: body as any,
    contentType: contentType,
    throw: false,
  });

  const resHeaders = new Headers();
  for (const key of Object.keys(res.headers)) {
    resHeaders.set(key, res.headers[key]);
  }

  return {
    url: url,
    status: res.status,
    statusText: "",
    ok: res.status >= 200 && res.status < 300,
    headers: resHeaders,
    json: async () => res.json,
    text: async () => res.text,
    arrayBuffer: async () => res.arrayBuffer,
    blob: async () => new Blob([res.arrayBuffer]),
  } as Response;
};

const nativeFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => await fetch(input, init);

/**
 * Use this instead of the global `fetch` for any call to a remote cloud API.
 *
 * On iOS/iPadOS it goes through `requestUrl` to dodge the WKWebView CORS wall
 * ("Load failed"), everywhere else it stays on the native `fetch` that desktop
 * and Android are already known to work with.
 */
export const platformSafeFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> =>
  Platform.isIosApp
    ? await obsidianFetch(input, init)
    : await nativeFetch(input, init);

/**
 * Whether the error is a low level "the request never completed" failure,
 * as opposed to an HTTP error with a real status code.
 *
 * The message differs per engine, and `JSON.stringify` on an `Error` yields
 * `{}` because its properties are not enumerable, so inspect the error itself.
 */
export const isNetworkLoadError = (e: unknown): boolean => {
  const err = e as any;
  const msg = [err?.name, err?.message, String(e ?? "")]
    .filter((x) => typeof x === "string")
    .join(" ")
    .toLowerCase();
  return (
    msg.includes("load failed") || // WebKit / iOS
    msg.includes("failed to fetch") || // Chromium
    msg.includes("networkerror") || // Firefox
    msg.includes("network request failed") ||
    msg.includes("the network connection was lost") ||
    msg.includes("net::") ||
    msg.includes("err_network") ||
    msg.includes("err_internet_disconnected")
  );
};
