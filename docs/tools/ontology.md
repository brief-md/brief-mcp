# Ontology Tools

13 tools for searching, browsing, installing, creating, and tagging ontology packs. Ontologies are structured knowledge bases (e.g., design patterns, architectural styles, compliance frameworks) that can be linked to BRIEF.md sections via tags.

---

### `brief_search_ontology`

Search across installed ontology packs for entries matching a query. Useful for finding relevant patterns, concepts, or standards.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | Yes | Search query (e.g., "caching strategy", "GDPR", "microservice pattern"). |
| packs | string[] | No | Limit search to specific ontology packs by name. If omitted, searches all installed packs. |
| max_results | number | No | Maximum number of results to return. |

**Example:**
> "Search ontologies for authentication patterns"

**Returns:** A ranked list of matching ontology entries, each with its ID, label, description, the ontology pack it belongs to, and a relevance score.

---

### `brief_get_ontology_entry`

Get a specific ontology entry by its ID. Returns the full entry with all metadata, relationships, and column values.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ontology | string | Yes | Name of the ontology pack. |
| entry_id | string | Yes | The unique identifier of the entry within the pack. |

**Example:**
> "Show me the details of the 'circuit-breaker' entry in the resilience-patterns ontology"

**Returns:** The complete entry including its ID, label, description, all column values, parent/child relationships, and any tags linking it to BRIEF.md sections.

---

### `brief_browse_ontology`

Browse the neighborhood of a specific ontology entry -- its parents, children, and siblings. Useful for exploring related concepts.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ontology | string | Yes | Name of the ontology pack. |
| entry_id | string | Yes | The entry to browse from. |
| direction | enum | No | Direction to browse. One of: `up` (ancestors), `down` (descendants), `around` (siblings), `all` (everything). Defaults to `all`. |

**Example:**
> "Show me what's related to the 'event-sourcing' entry in the architecture-patterns ontology"

**Returns:** A list of related entries in the requested direction, each with its ID, label, description, and relationship type to the browsed entry.

---

### `brief_list_ontologies`

List ontology packs available or installed in the current environment.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| installed | boolean | No | If true, list only installed packs. If false, list all available packs. Defaults to listing installed packs. |

**Example:**
> "What ontology packs are installed?"

**Returns:** A list of ontology packs with their names, descriptions, entry counts, and installation status.

---

### `brief_install_ontology`

Install an ontology pack from a source (local file, URL, or registry name).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| source | string | Yes | The source to install from. Can be a registry name (e.g., "design-patterns"), a local file path, or a URL. |
| name | string | No | Override the pack name. If omitted, the name is derived from the source. |

**Example:**
> "Install the design-patterns ontology pack"

**Returns:** Confirmation that the ontology was installed, along with a summary of the pack (name, entry count, description).

---

### `brief_remove_ontology`

Remove an installed ontology pack.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ontology | string | Yes | Name of the ontology pack to remove. |
| remove_tags | boolean | No | Whether to also remove all tags in BRIEF.md files that reference this ontology. Defaults to false. |

**Example:**
> "Remove the compliance-frameworks ontology"

**Returns:** Confirmation that the ontology was removed. If `remove_tags` was true, also reports how many tags were cleaned up.

---

### `brief_create_ontology`

Create a custom ontology pack from a list of entries. Useful for defining project-specific or domain-specific knowledge structures.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Name for the new ontology pack. |
| entries | object[] | Yes | Array of entry objects. Each entry should have at minimum an `id` and `label`, and optionally `description`, `parent_id`, and column values. |

**Example:**
> "Create a custom ontology called 'team-conventions' with entries for our naming patterns and code review standards"

**Returns:** The created ontology pack summary including name, entry count, and the full list of entries.

---

### `brief_ontology_draft`

Start an interactive ontology builder session. Guides you through creating a well-structured ontology pack step by step.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Name for the ontology being drafted. |
| description | string | Yes | Description of what this ontology covers. |

**Example:**
> "Help me draft an ontology for API error handling patterns"

**Returns:** The first step of the interactive builder, prompting for entries, relationships, and structure.

---

### `brief_tag_entry`

Tag a BRIEF.md section with an ontology entry. Tags create a semantic link between a section of your project context and a concept in an ontology.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ontology | string | Yes | Name of the ontology pack. |
| entry_id | string | Yes | The ontology entry ID to tag with. |
| section | string | Yes | The BRIEF.md section heading to tag. |
| paragraph | string | No | Specific paragraph within the section to tag. If omitted, the tag applies to the entire section. |
| label_override | string | No | Override the display label for this tag. |

**Example:**
> "Tag the Architecture section with the 'event-sourcing' entry from the architecture-patterns ontology"

**Returns:** Confirmation that the tag was added, showing the linked section and ontology entry.

---

### `brief_list_tags`

List all ontology tags in a project's BRIEF.md.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| project_path | string | No | Path to the project. Defaults to the active project. |
| extension_filter | string | No | Filter tags to those within a specific extension's sections. |

**Example:**
> "What ontology tags are in this project?"

**Returns:** A list of all tags, each showing the tagged section, the ontology pack, the entry ID, and the entry label.

---

### `brief_remove_tag`

Remove an ontology tag from a BRIEF.md section.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ontology | string | Yes | Name of the ontology pack. |
| entry_id | string | Yes | The ontology entry ID to untag. |
| section | string | Yes | The section heading to remove the tag from. |
| paragraph | string | No | Specific paragraph to untag. If omitted, removes the section-level tag. |
| project_path | string | No | Path to the project. Defaults to the active project. |

**Example:**
> "Remove the event-sourcing tag from the Architecture section"

**Returns:** Confirmation that the tag was removed.

---

### `brief_list_ontology_columns`

List the columns (metadata fields) defined in an ontology pack. Columns describe the structured data available for each entry beyond ID, label, and description.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ontology | string | Yes | Name of the ontology pack. |

**Example:**
> "What columns does the design-patterns ontology have?"

**Returns:** A list of column definitions, each with its name, type, and description.

---

### `brief_discover_ontologies`

Search for ontology packs across both local installations and external sources (registry, URLs). Useful for finding ontologies you have not yet installed.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | Yes | Search query describing the kind of ontology you are looking for. |

**Example:**
> "Find ontology packs related to cloud infrastructure"

**Returns:** A list of matching ontology packs from local and external sources, each with name, description, source, and installation status.
