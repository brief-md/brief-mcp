# Reference Tools

5 tools for managing and discovering references linked to BRIEF.md sections.

---

### `brief_add_reference`

Add a reference to a BRIEF.md section. References link external resources (papers, articles, documentation, tools) to specific parts of the project context.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| section | string | Yes | The BRIEF.md section heading to add the reference to. |
| title | string | Yes | Title of the referenced resource. |
| creator | string | No | Author, organization, or creator of the resource. |
| notes | string | No | Notes about why this reference is relevant or how to use it. |
| url | string | No | URL to the resource. |
| ontology_links | object[] | No | Array of ontology links to associate with this reference. Each object should have `ontology` (string) and `entry_id` (string) fields. |

**Example:**
> "Add a reference to the Architecture section: 'Designing Data-Intensive Applications' by Martin Kleppmann, with a note that chapter 11 covers event streaming"

**Returns:** Confirmation that the reference was added, showing the formatted reference entry in the section.

---

### `brief_get_entry_references`

Get all references associated with a specific ontology entry across all projects. Useful for finding resources related to a particular concept or pattern.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ontology | string | Yes | Name of the ontology pack. |
| entry_id | string | Yes | The ontology entry ID to find references for. |
| type_filter | string | No | Filter references by type (e.g., "book", "article", "documentation"). |
| extension_filter | string | No | Filter references to those within a specific extension's sections. |
| max_results | number | No | Maximum number of references to return. |

**Example:**
> "Show me all references linked to the 'circuit-breaker' entry in the resilience-patterns ontology"

**Returns:** A list of references linked to the specified ontology entry, each with title, creator, URL, notes, and the section/project where they appear.

---

### `brief_suggest_references`

Suggest relevant references based on a given context string. Uses the project's ontology tags and existing references to recommend additional resources.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| context | string | Yes | A description of the context for which references are needed (e.g., "implementing distributed caching with Redis"). |
| existing_references | object[] | No | Array of already-known references to exclude from suggestions. Each object should have `title` and optionally `creator` fields. |

**Example:**
> "Suggest references for implementing a CQRS architecture"

**Returns:** A list of suggested references with title, creator, URL (if available), and a relevance explanation.

---

### `brief_lookup_reference`

Lookup references by creator name or title across all projects and extensions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| creator | string | No | Creator name to search for. |
| title | string | No | Title or partial title to search for. |
| type_filter | string | No | Filter results by reference type. |

**Example:**
> "Find all references by Martin Fowler"

**Returns:** A list of matching references with their full details (title, creator, URL, notes) and the projects/sections where they appear.

---

### `brief_discover_references`

Build a search query to discover references relevant to an extension context. This tool generates targeted search suggestions based on the extension's domain, associated ontology entries, and existing references.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| extension_name | string | Yes | Name of the extension to discover references for. |
| extension_description | string | No | Description of the extension's purpose. |
| project_type | string | No | The project type, used to refine suggestions. |
| entry_labels | string[] | No | Labels from ontology entries associated with this extension. |
| entry_descriptions | string[] | No | Descriptions from ontology entries associated with this extension. |
| entry_tags | string[] | No | Tags from ontology entries associated with this extension. |
| existing_references | object[] | No | Already-known references to exclude from discovery. |
| max_results | number | No | Maximum number of suggestions to return. |

**Example:**
> "Discover references for the security extension in my API project, considering our OWASP ontology tags"

**Returns:** A set of reference search suggestions with recommended search queries, expected resource types, and relevance explanations tailored to the extension context.
