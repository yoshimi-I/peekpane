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
