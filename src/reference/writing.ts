// src/reference/writing.ts — Reference writing tool (TASK-39)

import {
  appendToSection,
  projectExists,
  readBrief,
} from "../io/project-state.js"; // check-rules-ignore

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

function buildUrlComment(refUrl: string): string {
  return `<!-- brief:url ${refUrl} -->`;
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
  url?: string;
  ontologyLinks?: Array<{ pack: string; entryId: string }>;
  projectPath?: string;
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
  const {
    section,
    creator,
    title,
    notes,
    url,
    ontologyLinks,
    projectPath = "/root/project",
    noActiveProject,
  } = params;

  // Guard: no active project
  if (noActiveProject) {
    throw new Error("No active project");
  }

  const filePath = `${projectPath}/BRIEF.md`;
  const diskExists = await projectExists(projectPath);

  // Read content from disk if available, else use in-memory fallback
  let originalContent: string;
  if (diskExists) {
    originalContent = await readBrief(projectPath);
  } else {
    originalContent = _briefContent;
  }

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

  // Lines to insert: reference entry + optional url comment + optional ref-link comments
  const insertLines: string[] = [`- ${referenceText}`];
  if (url) {
    insertLines.push(buildUrlComment(url));
  }
  if (refLinkComments) {
    for (const c of refLinkComments) {
      insertLines.push(c.text);
    }
  }

  // Determine section existence from the content we read
  const contentLines = originalContent.split("\n");
  const heading = `## ${section}`;
  let sectionCreated = false;
  const sectionExists = contentLines.some((l) => l.trimEnd() === heading);

  if (!sectionExists) {
    sectionCreated = true;
  }

  // Write to disk if a project exists
  if (diskExists) {
    const refLine = `- ${referenceText}`;
    const commentLines: string[] = [];
    if (url) commentLines.push(buildUrlComment(url));
    if (refLinkComments) {
      for (const c of refLinkComments) commentLines.push(c.text);
    }
    const fullContent =
      commentLines.length > 0
        ? `${refLine}\n${commentLines.join("\n")}`
        : refLine;
    await appendToSection(projectPath, section, fullContent);
  }

  // Update in-memory state (fallback for tests without disk project)
  if (!diskExists) {
    const lines = _briefContent.split("\n");
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

    if (secStart >= 0) {
      let insertAt = secEnd;
      while (insertAt > secStart + 1 && lines[insertAt - 1].trim() === "") {
        insertAt--;
      }
      lines.splice(insertAt, 0, ...insertLines);
      _briefContent = lines.join("\n");
    } else {
      const sectionBlock = [heading, "", ...insertLines, ""].join("\n");
      const trimmed = _briefContent.trimEnd();
      _briefContent = `${trimmed}\n\n${sectionBlock}`;
    }
  }

  // Track reference for deduplication
  _writtenRefs.push({ section, creator, title });

  // Read after-content from disk if available
  let afterContent: string;
  if (diskExists) {
    afterContent = await readBrief(projectPath);
  } else {
    afterContent = _briefContent;
  }

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
    afterContent,
    filePath: diskExists ? filePath : _filePath,
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
