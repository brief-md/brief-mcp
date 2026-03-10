// src/extension/removal.ts — GAP-I: Extension removal

import { readBrief, writeBrief } from "../io/project-state.js"; // check-rules-ignore
import { getActiveProject } from "../workspace/active.js"; // check-rules-ignore
import {
  syncExtensionMetadata,
  translateExtensionName,
} from "../writer/metadata-sync.js"; // check-rules-ignore

export async function removeExtension(params: {
  extensionName: string;
  projectPath?: string;
  removeContent?: boolean;
}): Promise<{
  removed: boolean;
  sectionsRemoved: string[];
  metadataUpdated: boolean;
  filePath: string;
  warnings: string[];
}> {
  const { extensionName, removeContent = false } = params;
  const projectPath = params.projectPath ?? getActiveProject()?.path;

  if (!projectPath) {
    return {
      removed: false,
      sectionsRemoved: [],
      metadataUpdated: false,
      filePath: "",
      warnings: [
        "No active project set and no project_path provided. Use brief_set_active_project first.",
      ],
    };
  }

  const warnings: string[] = [];

  // Normalise name to heading format for content matching
  const headingName = /^[a-z_]+$/.test(extensionName)
    ? translateExtensionName(extensionName, "toHeading")
    : extensionName.toUpperCase();

  const metaName = translateExtensionName(headingName, "toMetadata");

  // Read current BRIEF.md
  let content: string;
  try {
    content = await readBrief(projectPath);
  } catch {
    return {
      removed: false,
      sectionsRemoved: [],
      metadataUpdated: false,
      filePath: `${projectPath}/BRIEF.md`,
      warnings: ["Could not read BRIEF.md"],
    };
  }

  if (!content) {
    return {
      removed: false,
      sectionsRemoved: [],
      metadataUpdated: false,
      filePath: `${projectPath}/BRIEF.md`,
      warnings: ["BRIEF.md is empty"],
    };
  }

  // Check if extension exists in metadata
  const metaRe = new RegExp(
    `\\b${metaName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
  );
  const inMetadata =
    /\*\*Extensions:\*\*/.test(content) && metaRe.test(content);

  if (!inMetadata) {
    return {
      removed: false,
      sectionsRemoved: [],
      metadataUpdated: false,
      filePath: `${projectPath}/BRIEF.md`,
      warnings: [`Extension '${extensionName}' not found in metadata`],
    };
  }

  // Remove from metadata
  let updated = await syncExtensionMetadata(content, {
    action: "remove",
    extensionName: headingName,
  });
  const metadataUpdated = updated !== content;

  // Optionally remove content (# HEADING through next # heading at same or lower level)
  const sectionsRemoved: string[] = [];

  if (removeContent) {
    const headingEscaped = headingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const headingRe = new RegExp(`^# ${headingEscaped}\\s*$`, "m");
    const headingMatch = headingRe.exec(updated);

    if (headingMatch) {
      const startIdx = headingMatch.index;
      const afterHeading = updated.slice(startIdx + headingMatch[0].length);

      // Find the next # heading (level 1) — marks end of this extension
      const nextH1 = /^# /m.exec(afterHeading);
      const endIdx = nextH1
        ? startIdx + headingMatch[0].length + nextH1.index
        : updated.length;

      // Extract subsection names being removed
      const removedBlock = updated.slice(startIdx, endIdx);
      const subRe = /^## (.+)$/gm;
      let subMatch = subRe.exec(removedBlock);
      while (subMatch) {
        sectionsRemoved.push(subMatch[1].trim());
        subMatch = subRe.exec(removedBlock);
      }

      // Remove the block, collapsing extra blank lines
      updated =
        updated.slice(0, startIdx).replace(/\n{2,}$/, "\n\n") +
        updated.slice(endIdx).replace(/^\n{2,}/, "\n");
    }
  }

  // Write back
  await writeBrief(projectPath, updated);

  return {
    removed: true,
    sectionsRemoved,
    metadataUpdated,
    filePath: `${projectPath}/BRIEF.md`,
    warnings,
  };
}
