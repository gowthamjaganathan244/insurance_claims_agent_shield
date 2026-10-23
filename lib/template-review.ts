/** Deterministic, rule-based review of a stored email template. No network, no AI, no invented content. */
export interface TemplateFinding {
  id: string;
  title: string;
  passed: boolean;
  evidence: string;
}
const vars = (value: string) =>
  new Set(
    (value.match(/{{\s*[^{}]+?\s*}}/g) ?? []).map((v) => v.replace(/\s+/g, "")),
  );
const count = (value: string, pattern: RegExp) =>
  (value.match(pattern) ?? []).length;
export function reviewTemplate(t: {
  subject: string;
  text: string;
  html: string;
}): TemplateFinding[] {
  const html = t.html ?? "";
  const textVars = vars(t.text);
  const htmlVars = vars(html);
  const onlyHtml = [...htmlVars].filter((v) => !textVars.has(v));
  const onlyText = [...textVars].filter((v) => !htmlVars.has(v));
  const legacy = count(html, /<(font|center|marquee|blink)\b/gi);
  const layoutTables = count(html, /<table\b/gi);
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const noAlt = images.filter((img) => !/\balt\s*=/i.test(img)).length;
  const insecure = count(html + t.text, /\bhttp:\/\/(?!localhost)/gi);
  const subjectLength = [...t.subject.replace(/{{[^{}]+}}/g, "")].length;
  return [
    {
      id: "plain-text",
      title: "Plain-text alternative",
      passed: t.text.trim().length > 0,
      evidence: t.text.trim()
        ? `${t.text.trim().length} characters`
        : "Text part is empty; some clients and filters penalise HTML-only mail.",
    },
    {
      id: "subject-length",
      title: "Subject fits mobile previews",
      passed: subjectLength > 0 && subjectLength <= 60,
      evidence: `${subjectLength} static characters (guideline: 60 or fewer)`,
    },
    {
      id: "variables",
      title: "Variables consistent across HTML and text",
      passed: !onlyHtml.length && !onlyText.length,
      evidence:
        onlyHtml.length || onlyText.length
          ? [
              onlyHtml.length && `HTML only: ${onlyHtml.join(", ")}`,
              onlyText.length && `Text only: ${onlyText.join(", ")}`,
            ]
              .filter(Boolean)
              .join(" · ")
          : `${new Set([...textVars, ...htmlVars]).size} placeholders in both parts`,
    },
    {
      id: "legacy-markup",
      title: "No deprecated HTML elements",
      passed: legacy === 0,
      evidence: legacy
        ? `${legacy} deprecated element(s) such as <font> or <center>`
        : "None found",
    },
    {
      id: "viewport",
      title: "Mobile viewport declared",
      passed: !html || /<meta[^>]+name=["']?viewport/i.test(html),
      evidence: !html
        ? "No HTML part"
        : /<meta[^>]+name=["']?viewport/i.test(html)
          ? "Viewport meta present"
          : "No viewport meta tag",
    },
    {
      id: "image-alt",
      title: "Images have alternative text",
      passed: noAlt === 0,
      evidence: images.length
        ? `${images.length - noAlt} of ${images.length} images have alt text`
        : "No images",
    },
    {
      id: "https",
      title: "Links use HTTPS",
      passed: insecure === 0,
      evidence: insecure ? `${insecure} http:// link(s)` : "No insecure links",
    },
    {
      id: "layout",
      title: "Layout tables (informational)",
      passed: true,
      evidence: layoutTables
        ? `${layoutTables} <table> element(s); still the most compatible email layout`
        : "No tables",
    },
  ];
}
