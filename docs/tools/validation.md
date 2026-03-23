# Validation Tools

2 tools for linting BRIEF.md files and checking for conflicting decisions.

---

### `brief_lint`

Lint a BRIEF.md file to check for structural issues, missing required sections, formatting problems, and integrity violations. This is the primary quality-check tool.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | No | Path to the project or BRIEF.md file to lint. Defaults to the active project. |
| verify_integrity | boolean | No | Whether to verify referential integrity (e.g., that superseded decisions reference valid targets, that ontology tags reference installed packs). Defaults to false. |

**Example:**
> "Lint the BRIEF.md for this project"

**Returns:** A list of lint findings, each with a severity level (error, warning, info), a message describing the issue, and the line number or section where the issue was found. Returns a clean result if no issues are detected.

---

### `brief_check_conflicts`

Check for conflicting decisions within a project or across a hierarchy. Detects decisions that contradict each other, constraints that conflict with decisions, and cross-hierarchy inconsistencies.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| scope | string | No | Scope of conflict checking. Controls whether to check only the local project or include parent/child projects in the hierarchy. |
| semantic | boolean | No | Whether to perform semantic (meaning-based) conflict detection in addition to exact-match detection. Enables deeper analysis but may be slower. |
| project_type | string | No | The project type, used to apply type-specific conflict rules. |

**Example:**
> "Check for any conflicting decisions in the project hierarchy"

**Returns:** A list of detected conflicts, each describing the two conflicting items, the nature of the conflict, and which projects they originate from. Returns an empty list if no conflicts are found.
