export interface ManualCitationInput {
  title: string;
  authors?: string;
  year?: string;
  itemType: string;
  doi?: string;
  url?: string;
  publicationTitle?: string;
}

const SUPPORTED_TYPES = new Set([
  "journalArticle",
  "book",
  "conferencePaper",
  "thesis",
  "report",
  "webpage",
]);

const TYPES_WITH_DOI = new Set(["journalArticle", "conferencePaper"]);

const PUBLICATION_FIELD: Record<string, string> = {
  journalArticle: "publicationTitle",
  conferencePaper: "proceedingsTitle",
  webpage: "websiteTitle",
};

export function parseAuthors(authors: string | undefined) {
  return (authors || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .map((name) => {
      const parts = name.split(/\s+/);
      return {
        creatorType: "author",
        firstName: parts.slice(0, -1).join(" "),
        lastName: parts[parts.length - 1],
      };
    });
}

export function buildManualItemData(input: ManualCitationInput): Record<string, unknown> {
  const itemType = SUPPORTED_TYPES.has(input.itemType) ? input.itemType : "document";
  const extra: string[] = [];
  const data: Record<string, unknown> = {
    itemType,
    title: input.title.trim() || "Untitled",
    creators: parseAuthors(input.authors),
  };

  if (input.year?.trim()) {
    data.date = input.year.trim();
  }
  if (input.url?.trim()) {
    data.url = input.url.trim();
  }

  const doi = input.doi?.trim();
  if (doi) {
    if (TYPES_WITH_DOI.has(itemType)) {
      data.DOI = doi;
    } else {
      extra.push(`DOI: ${doi}`);
    }
  }

  const publication = input.publicationTitle?.trim();
  if (publication) {
    const field = PUBLICATION_FIELD[itemType];
    if (field) {
      data[field] = publication;
    } else {
      extra.push(`Publication: ${publication}`);
    }
  }

  if (extra.length > 0) {
    data.extra = extra.join("\n");
  }
  return data;
}
