const pagesApiOrigin = process.env.NEXT_PUBLIC_REGGIE_API_ORIGIN ?? "";

export function adminApiUrl(path: string) {
  if (typeof window === "undefined" || !pagesApiOrigin) {
    return path;
  }

  if (window.location.hostname.endsWith(".pages.dev")) {
    return `${pagesApiOrigin}${path}`;
  }

  return path;
}