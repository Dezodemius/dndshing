type RichTextNode = {
  type: string;
  text?: string;
  marks?: Array<{
    type: string;
  }>;
  content?: RichTextNode[] | null;
};

type RichTextDocument = {
  type: "doc";
  content: RichTextNode[] | null;
};

export function createLssRichText(
  text: string,
  idPrefix?: string
): {
  id?: string;
  data: RichTextDocument;
} {
  const paragraphs = text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map<RichTextNode>((line) => ({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: line
        }
      ]
    }));

  return {
    ...(idPrefix ? { id: `hover-toolbar-${idPrefix}-${randomId()}` } : {}),
    data: {
      type: "doc",
      content:
        paragraphs.length > 0
          ? paragraphs
          : [
              {
                type: "paragraph"
              }
            ]
    }
  };
}

export function extractPlainText(value: unknown): string {
  return collectText(value)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectText(value: unknown): string[] {
  if (typeof value === "string") {
    return [stripHtml(value)];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectText);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.text === "string") {
      return [record.text];
    }

    if (Array.isArray(record.content)) {
      return record.content.flatMap(collectText);
    }

    if ("data" in record) {
      return collectText(record.data);
    }

    if ("value" in record) {
      return collectText(record.value);
    }
  }

  return [];
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function randomId(): string {
  return Math.floor(Math.random() * 10000000000).toString();
}
