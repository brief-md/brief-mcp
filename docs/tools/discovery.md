# Discovery Tools

3 tools for detecting project frameworks, assessing project maturity, and searching the extension/ontology registry.

---

### `brief_get_project_frameworks`

Detect frameworks and technologies used in a project by analyzing its files (package.json, Cargo.toml, requirements.txt, etc.). Useful for automatically suggesting relevant extensions and ontologies based on the actual tech stack.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| project | string | No | Path to the project directory to analyze. Defaults to the active project. |

**Example:**
> "What frameworks does this project use?"

**Returns:** A list of detected frameworks and technologies, each with a name, version (if detectable), category (e.g., "web-framework", "test-framework", "build-tool"), and confidence level.

---

### `brief_get_maturity_signals`

Get maturity signals for a project. Analyzes the BRIEF.md completeness, number of decisions, constraint coverage, extension usage, and other indicators to assess how well-documented and structured the project context is.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| project_path | string | No | Path to the project. Defaults to the active project. |

**Example:**
> "How mature is this project's BRIEF documentation?"

**Returns:** A set of maturity signals including: section completeness scores, decision count, constraint count, extension count, ontology tag density, open question count, and an overall maturity assessment with suggestions for improvement.

---

### `brief_search_registry`

Search the public registry for ontology packs and type guides. The registry is the central catalog of community-contributed and official resources.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | No | Search query. If omitted, returns popular or featured items. |
| type_filter | enum | No | Filter by resource type. One of: `ontology` (ontology packs only), `type-guide` (type guides only), `all` (both). Defaults to `all`. |

**Example:**
> "Search the registry for Kubernetes-related resources"

**Returns:** A list of matching registry entries, each with name, type (ontology or type-guide), description, author, download count, and installation instructions.
