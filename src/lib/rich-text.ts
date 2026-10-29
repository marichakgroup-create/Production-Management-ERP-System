const ALLOWED = new Set(["b", "strong", "i", "em", "ul", "ol", "li", "p", "br"]);

export function sanitizeRichHtml(html: string | null | undefined): string {
  const raw = String(html ?? "");
  if (!raw.trim()) return "";
  const stripped = raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  return stripped.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (all, tag: string) => {
    const name = tag.toLowerCase();
    if (!ALLOWED.has(name)) return "";
    if (name === "br") return "<br>";
    if (all.startsWith("</")) return `</${name}>`;
    return `<${name}>`;
  });
}

export function richTextIsEmpty(html: string | null | undefined): boolean {
  return (
    sanitizeRichHtml(html)
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .trim() === ""
  );
}
