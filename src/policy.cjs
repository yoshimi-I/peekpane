exports.allowed = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:")
      return !parsed.hostname || parsed.hostname === "localhost";
    return ["data:", "blob:", "about:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};
exports.externalURL = (value) => {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol)) return url.href;
  } catch {
    /* Relative paths and unsupported protocols are not browser launch requests. */
  }
};
