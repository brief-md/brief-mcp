# Extensions, Type Guides & Structured Sections Tools

13 tools organized into three groups: extension management (5), type guides (4), and structured sections (4).

---

## Extension Management

### `brief_suggest_extensions`

Suggest extensions appropriate for a given project type. Extensions add domain-specific sections to BRIEF.md (e.g., "security" adds threat model sections, "api-design" adds endpoint documentation sections).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| project_type | string | Yes | The project type (e.g., "web-app", "api", "library", "cli-tool"). |
| description | string | No | A description of the project to refine suggestions. |
| active_extensions | string[] | No | Extensions already added, to avoid re-suggesting them. |

**Example:**
> "What extensions should I add to my API project?"

**Returns:** A ranked list of suggested extensions, each with its name, description, the sections it would add, and a rationale for why it is relevant to the project type.

---

### `brief_design_extension`

Design a custom extension by defining its name, description, and subsections. This creates an extension definition that can then be added to a BRIEF.md.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| extension_name | string | Yes | Name of the extension to design (e.g., "ml-pipeline", "compliance"). |
| description | string | Yes | Description of what the extension covers. |
| subsections | string[] | No | List of subsection headings for the extension. If omitted, appropriate subsections will be suggested. |
| project_type | string | No | The project type, used to tailor the extension design. |

**Example:**
> "Design a custom extension called 'data-pipeline' for managing ETL workflow documentation"

**Returns:** The complete extension definition with name, description, subsection headings, and example content for each subsection.

---

### `brief_add_extension`

Add an extension to the active project's BRIEF.md. This inserts the extension's sections into the document.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| extension_name | string | Yes | Name of the extension to add. |
| subsections | string[] | No | Custom subsection headings. If omitted, uses the extension's default subsections. |
| section_modes | object | No | Map of section heading to mode (e.g., `{"Threat Model": "append", "Security Constraints": "replace"}`). Controls how sections interact with existing content. |
| subsection_descriptions | object | No | Map of subsection heading to description text. Provides guidance content within each subsection. |
| project_path | string | No | Path to the project. Defaults to the active project. |

**Example:**
> "Add the security extension to this project"

**Returns:** Confirmation that the extension was added, listing the new sections inserted into BRIEF.md.

---

### `brief_list_extensions`

List all extensions currently active in the project's BRIEF.md.

**Parameters:**

None.

**Example:**
> "What extensions are active in this project?"

**Returns:** A list of active extensions with their names, descriptions, and the sections each one contributes.

---

### `brief_remove_extension`

Remove an extension from the project's BRIEF.md.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| extension_name | string | Yes | Name of the extension to remove. |
| project_path | string | No | Path to the project. Defaults to the active project. |
| remove_content | boolean | No | Whether to also remove the extension's section content from BRIEF.md. If false, only the extension registration is removed but the content remains. Defaults to false. |

**Example:**
> "Remove the security extension from the project"

**Returns:** Confirmation that the extension was removed. Reports whether content was also deleted.

---

## Type Guides

### `brief_get_type_guide`

Get the type guide for a specific project type. Type guides provide recommended structure, extensions, ontologies, and conventions for a project type.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| type | string | No | The project type to get the guide for (e.g., "web-app", "api"). Defaults to the active project's type. |

**Example:**
> "Show me the type guide for API projects"

**Returns:** The complete type guide including suggested extensions, ontologies, common parent/child types, reference sources, and the guide body with conventions and best practices.

---

### `brief_create_type_guide`

Create a new type guide. Type guides codify best practices and recommended setup for a particular project type.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| type | string | Yes | The project type this guide covers. |
| type_aliases | string[] | No | Alternative names for this project type (e.g., ["web-application", "webapp"] for "web-app"). |
| suggested_extensions | string[] | No | Extensions recommended for this project type. |
| suggested_ontologies | string[] | No | Ontology packs recommended for this project type. |
| common_parent_types | string[] | No | Project types that commonly serve as parents (e.g., "monorepo"). |
| common_child_types | string[] | No | Project types that commonly appear as children. |
| reference_sources | string[] | No | Recommended reference sources for this project type. |
| body | string | No | The guide body in markdown. Contains conventions, patterns, and best practices. |
| force | boolean | No | Overwrite an existing guide for this type. Defaults to false. |

**Example:**
> "Create a type guide for 'data-pipeline' projects with extensions for monitoring and data-quality"

**Returns:** Confirmation that the type guide was created, along with the full guide content.

---

### `brief_suggest_type_guides`

Search for type guides matching a query. Useful when you are unsure of the exact type name or want to explore available guides.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | Yes | Search query describing the kind of project (e.g., "machine learning", "mobile app"). |
| description | string | No | Additional description to refine the search. |
| early_decisions | string | No | Decisions already made that might narrow down the appropriate type guide. |
| max_results | number | No | Maximum number of results to return. |

**Example:**
> "What type guides are available for machine learning projects?"

**Returns:** A ranked list of matching type guides with their type name, description, and relevance score.

---

### `brief_apply_type_guide`

Apply a type guide to a project. This installs the recommended extensions and ontologies, and applies the guide's conventions to the project's BRIEF.md.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| type | string | Yes | The type guide to apply. |
| project_path | string | No | Path to the project. Defaults to the active project. |
| auto_install_extensions | boolean | No | Automatically install all suggested extensions. Defaults to false. |
| auto_install_ontologies | boolean | No | Automatically install all suggested ontology packs. Defaults to false. |

**Example:**
> "Apply the API type guide to this project and auto-install its extensions and ontologies"

**Returns:** A summary of what was applied: extensions installed, ontologies installed, and any conventions or sections added to BRIEF.md.

---

## Structured Sections

### `brief_link_section_dataset`

Link a BRIEF.md section to an ontology dataset, enabling structured data views. This associates specific ontology columns with a section so entries can be displayed in a table format.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| section | string | Yes | The BRIEF.md section heading to link. |
| ontology | string | Yes | Name of the ontology pack to link. |
| columns | string[] | Yes | List of ontology column names to display in the section. |
| project_path | string | No | Path to the project. Defaults to the active project. |

**Example:**
> "Link the Requirements section to the compliance-frameworks ontology, showing the 'control-id', 'description', and 'status' columns"

**Returns:** Confirmation that the section is now linked to the ontology dataset with the specified columns.

---

### `brief_convert_to_structured`

Convert an existing free-text section into a structured format backed by an ontology. Analyzes the section content and maps it to ontology entries.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| section | string | Yes | The section heading to convert. |
| ontology | string | Yes | The ontology pack to map content to. |
| columns | string[] | Yes | The ontology columns to populate from the section content. |
| match_threshold | number | No | Minimum confidence threshold (0-1) for matching section content to ontology entries. Defaults to a sensible threshold. |
| project_path | string | No | Path to the project. Defaults to the active project. |

**Example:**
> "Convert the Architecture Patterns section to structured format using the design-patterns ontology"

**Returns:** The converted section content showing matched ontology entries, their column values, and any unmatched content that could not be mapped.

---

### `brief_preview_dataset`

Preview the data available in an ontology dataset before linking it to a section. Shows a sample of entries with the requested columns.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ontology | string | Yes | Name of the ontology pack. |
| columns | string[] | Yes | List of column names to preview. |

**Example:**
> "Preview the design-patterns ontology showing name, category, and complexity columns"

**Returns:** A table-formatted preview of ontology entries with the requested column values.

---

### `brief_fetch_dataset`

Fetch a dataset from an external source for use as an ontology or structured section data.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| source | string | Yes | The source to fetch from (URL, file path, or registry identifier). |

**Example:**
> "Fetch the OWASP Top 10 dataset from the registry"

**Returns:** The fetched dataset content, ready for use with `brief_create_ontology` or `brief_link_section_dataset`.
