// src/types/parser.ts

export type ParseWarningSeverity = "warning" | "info";

export interface ParseWarning {
  message: string;
  severity: ParseWarningSeverity;
  line?: number;
}

export interface BriefMetadata {
  Project?: string;
  Type?: string;
  Created?: string;
  Updated?: string;
  Extensions?: string[];
  Ontologies?: OntologyMetadataEntry[];
  Status?: string;
  Version?: string;
  [key: string]: unknown;
}

export interface OntologyMetadataEntry {
  name: string;
  version?: string;
  excludes?: string[];
}

export type SectionClassification =
  | "core"
  | "extension"
  | "project-specific"
  | "tool-specific";

export interface Section {
  heading: string;
  level: number;
  body: string;
  classification: SectionClassification;
  toolName?: string;
  canonicalName?: string;
  headingText?: string;
  hasDuplicate?: boolean;
  subsections?: Section[];
}

export interface OntologyTag {
  type: "ontology";
  pack: string;
  entryId: string;
  label: string;
  associatedParagraph?: string;
  associatedLine: number;
  body?: string;
}

export interface RefLinkTag {
  type: "ref-link";
  pack: string;
  entryId: string;
  associatedLine: number;
}

export interface ExceptionTag {
  type: "has-exception";
  title: string;
  date: string;
  associatedLine: number;
}

export interface UnknownBriefTag {
  type: "unknown";
  raw: string;
  associatedLine: number;
}

export type BriefTag =
  | OntologyTag
  | RefLinkTag
  | ExceptionTag
  | UnknownBriefTag;

export interface ParsedBriefMd {
  metadata: BriefMetadata;
  sections: Section[];
  decisions: import("./decisions.js").Decision[];
  questions: import("./decisions.js").Question[];
  extensions: string[];
  comments: BriefTag[];
  warnings: ParseWarning[];
  fieldOrder: string[];
}

export interface PreprocessResult {
  content: string;
  warnings: string[];
  hasBom: boolean;
  lineEndingStyle: "lf" | "crlf" | "mixed";
  strikethroughSegments?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  structuralHeadings?: Array<{
    text: string;
    level: number;
    line: number;
  }>;
  mode?: "streaming" | "in-memory";
}

export interface ParsedMetadata {
  fields: Map<string, string>;
  warnings: string[];
  fieldOrder: string[];
  consumedRange?: { start: number; end: number };
}
