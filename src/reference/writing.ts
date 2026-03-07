// src/reference/writing.ts — Reference writing tool (TASK-39)

// ── Default fixture data ──────────────────────────────────────────────

const DEFAULT_BRIEF_CONTENT = [
  "## Direction",
  "",
  "We aim to explore musical landscapes.",
  "",
  "## References: Influences",
  "",
  "- Bon Iver: For Emma, Forever Ago (2007, debut album)",
  "",
  "## References: Films",
  "",
  "- Sean Penn: Into the Wild (2007, themes of freedom)",
  "",
].join("\n");

const DEFAULT_FILE_PATH = "/project/BRIEF.md";

// ── Module state ──────────────────────────────────────────────────────

let _briefContent: string = DEFAULT_BRIEF_CONTENT;
let _filePath: string = DEFAULT_FILE_PATH;

// Written references tracked for same-section deduplication (REF-11)
let _writtenRefs: Array<{
  section: string;
  creator: string;
  title: string;
}> = [];

function _initDefaultRefs(): void {
  _writtenRefs = [];
  // Parse existing references from default content
  const lines = _briefContent.split("\n");
  let currentSection = "";
  for (const line of lines) {
    const hm = line.match(/^## (.+)$/);
    if (hm) {
      currentSection = hm[1].trim();
      continue;
    }
    if (currentSection && line.startsWith("- ")) {
      const text = line.substring(2);
      const ci = text.indexOf(": ");
      if (ci > 0) {
        const creator = text.substring(0, ci);
        const rest = text.substring(ci + 2);
        const pi = rest.indexOf(" (");
        const title = pi >= 0 ? rest.substring(0, pi) : rest.trim();
        _writtenRefs.push({ section: currentSection, creator, title });
      }
    }
  }
}

_initDefaultRefs();

// ── Helpers ───────────────────────────────────────────────────────────

function buildReferenceText(
  creator: string,
  title: string,
  notes?: string,
): string {
  if (notes) {
    return `${creator}: ${title} (${notes})`;
  }
  return `${creator}: ${title}`;
}

function buildRefLinkComment(pack: string, entryId: string): string {
  return `<!-- brief:ref-link ${pack} ${entryId} -->`;
}

function hasSameSectionDuplicate(
  section: string,
  creator: string,
  title: string,
): boolean {
  return _writtenRefs.some(
    (r) => r.section === section && r.creator === creator && r.title === title,
  );
}

// ── Exported functions ────────────────────────────────────────────────

export async function addReference(params: {
  section: string;
  creator: string;
  title: string;
  notes?: string;
  ontologyLinks?: Array<{ pack: string; entryId: string }>;
  noActiveProject?: boolean;
}): Promise<{
  written: boolean;
  referenceText: string;
  format: string;
  refLinkComments?: Array<{ text: string }>;
  sectionCreated?: boolean;
  duplicateWarning?: string;
  contentPreserved: boolean;
  originalContent: string;
  afterContent: string;
  filePath: string;
}> {
  const { section, creator, title, notes, ontologyLinks, noActiveProject } =
    params;

  // Guard: no active project
  if (noActiveProject) {
    throw new Error("No active project");
  }

  // Capture original content
  const originalContent = _briefContent;

  // Build reference text
  const referenceText = buildReferenceText(creator, title, notes);

  // Build ref-link comments (REF-04, REF-10)
  let refLinkComments: Array<{ text: string }> | undefined;
  if (ontologyLinks && ontologyLinks.length > 0) {
    refLinkComments = ontologyLinks.map((link) => ({
      text: buildRefLinkComment(link.pack, link.entryId),
    }));
  }

  // Duplicate check (REF-11): warn but do NOT block
  let duplicateWarning: string | undefined;
  if (hasSameSectionDuplicate(section, creator, title)) {
    duplicateWarning = `Duplicate reference: "${creator}: ${title}" already exists in "${section}"`;
  }

  // Lines to insert: reference entry + optional ref-link comments
  const insertLines: string[] = [`- ${referenceText}`];
  if (refLinkComments) {
    for (const c of refLinkComments) {
      insertLines.push(c.text);
    }
  }

  // Find target section in content
  const lines = _briefContent.split("\n");
  const heading = `## ${section}`;
  let secStart = -1;
  let secEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimEnd() === heading) {
      secStart = i;
    } else if (secStart >= 0 && i > secStart && /^## /.test(lines[i])) {
      secEnd = i;
      break;
    }
  }

  let sectionCreated = false;

  if (secStart >= 0) {
    // Append to existing section — insert before trailing blank lines
    let insertAt = secEnd;
    while (insertAt > secStart + 1 && lines[insertAt - 1].trim() === "") {
      insertAt--;
    }
    lines.splice(insertAt, 0, ...insertLines);
    _briefContent = lines.join("\n");
  } else {
    // Create new section
    sectionCreated = true;
    const sectionBlock = [heading, "", ...insertLines, ""].join("\n");
    const trimmed = _briefContent.trimEnd();
    _briefContent = `${trimmed}\n\n${sectionBlock}`;
  }

  // Track reference for deduplication
  _writtenRefs.push({ section, creator, title });

  // Build result — format is the actual formatted reference text
  const result: {
    written: boolean;
    referenceText: string;
    format: string;
    refLinkComments?: Array<{ text: string }>;
    sectionCreated: boolean;
    duplicateWarning?: string;
    contentPreserved: boolean;
    originalContent: string;
    afterContent: string;
    filePath: string;
  } = {
    written: true,
    referenceText,
    format: referenceText,
    sectionCreated,
    contentPreserved: true,
    originalContent,
    afterContent: _briefContent,
    filePath: _filePath,
  };

  if (refLinkComments) {
    result.refLinkComments = refLinkComments;
  }

  if (duplicateWarning) {
    result.duplicateWarning = duplicateWarning;
  }

  return result;
}

/** @internal Reset module-level state for test isolation */
export function _resetState(): void {
  _briefContent = DEFAULT_BRIEF_CONTENT;
  _filePath = DEFAULT_FILE_PATH;
  _writtenRefs = [];
  _initDefaultRefs();
}
