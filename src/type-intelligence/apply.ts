// src/type-intelligence/apply.ts — WP4: Apply type guide (auto-install extensions & ontologies)

import { addExtension } from "../extension/creation.js"; // check-rules-ignore
import { readBrief, writeBrief } from "../io/project-state.js"; // check-rules-ignore
import { getTypeGuide } from "./loading.js"; // check-rules-ignore

export async function applyTypeGuide(params: {
  type: string;
  projectPath: string;
  autoInstallExtensions?: boolean;
  autoInstallOntologies?: boolean;
}): Promise<{
  applied: boolean;
  guideName: string;
  guideSource: string;
  extensionsInstalled: string[];
  extensionsFailed: string[];
  ontologiesSuggested: Array<{ name: string; status: string }>;
  warnings: string[];
  nextSteps: string[];
}> {
  const {
    type,
    projectPath,
    autoInstallExtensions = true,
    autoInstallOntologies = true,
  } = params;

  // 1. Load the type guide
  const result = await getTypeGuide({ type });
  const guide = result.guide;

  // 2. If generic, signal that a type guide should be created first
  if (result.isGeneric) {
    return {
      applied: false,
      guideName: guide.displayName,
      guideSource: guide.metadata.source,
      extensionsInstalled: [],
      extensionsFailed: [],
      ontologiesSuggested: [],
      warnings: [`No type guide found for '${type}'. Using generic fallback.`],
      nextSteps: [
        "Create a type guide first with brief_create_type_guide, then re-run brief_apply_type_guide",
      ],
    };
  }

  // 3. Install suggested extensions
  const extensionsInstalled: string[] = [];
  const extensionsFailed: string[] = [];

  if (autoInstallExtensions) {
    const suggestedExtensions = guide.metadata.suggestedExtensions ?? [];
    if (suggestedExtensions.length > 0) {
      const results = await Promise.allSettled(
        suggestedExtensions.map((ext) =>
          addExtension({ extensionName: ext.slug, projectPath }),
        ),
      );

      for (let i = 0; i < results.length; i++) {
        const settledResult = results[i];
        const extSlug = suggestedExtensions[i].slug;
        if (settledResult.status === "fulfilled") {
          extensionsInstalled.push(extSlug);
        } else {
          extensionsFailed.push(extSlug);
        }
      }
    }
  }

  // 4. Collect suggested ontologies
  const ontologiesSuggested: Array<{ name: string; status: string }> = [];

  if (autoInstallOntologies) {
    const suggestedOntologies = guide.metadata.suggestedOntologies ?? [];
    for (const ont of suggestedOntologies) {
      ontologiesSuggested.push({ name: ont.name, status: "suggested" });
    }
  }

  // 5. Build nextSteps
  const nextSteps: string[] = [];
  const warnings: string[] = [];

  if (ontologiesSuggested.length > 0) {
    nextSteps.push(
      "Install suggested ontologies with brief_install_ontology or create custom ones with brief_create_ontology",
    );
  }

  if (extensionsFailed.length > 0) {
    nextSteps.push(`Retry failed extensions: ${extensionsFailed.join(", ")}`);
    warnings.push(
      `Some extensions failed to install: ${extensionsFailed.join(", ")}`,
    );
  }

  // Update **Type:** field in BRIEF.md to reflect the applied type guide
  try {
    let briefContent = await readBrief(projectPath);
    const typeRe = /^\*\*Type:\*\*\s*.*$/m;
    if (typeRe.test(briefContent)) {
      briefContent = briefContent.replace(typeRe, `**Type:** ${type}`);
    }
    await writeBrief(projectPath, briefContent);
  } catch {
    warnings.push("Failed to update **Type:** field in BRIEF.md");
  }

  return {
    applied: true,
    guideName: guide.displayName,
    guideSource: guide.metadata.source,
    extensionsInstalled,
    extensionsFailed,
    ontologiesSuggested,
    warnings,
    nextSteps,
  };
}
