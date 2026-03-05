export interface TagEntryParams {
  pack?: string;
  ontology?: string;
  entryId?: string;
  filePath?: string;
  section?: string;
  paragraph?: string;
  label?: string;
  [key: string]: unknown;
}

export interface TagEntryResult {
  tagged: boolean;
  comment: string;
  label?: string;
  packVersion?: string;
  updatedOntologiesField?: string;
  metadataDuplicated?: boolean;
  [key: string]: unknown;
}

export async function tagEntry(
  _params: TagEntryParams,
): Promise<TagEntryResult> {
  return { tagged: false, comment: "" };
}
