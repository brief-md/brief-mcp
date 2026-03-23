# Context Reading Tools

4 tools for reading context, constraints, decisions, and questions from BRIEF.md files.

---

### `brief_get_context`

Read the full project context from a BRIEF.md file. This returns the complete structured content including identity, decisions, constraints, questions, and all extension sections.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| project_path | string | Yes | Path to the project whose context should be read. |
| scope | string | No | Scope of context to retrieve. Can be used to limit context to a specific hierarchy level (e.g., "local" for only this project, "inherited" for parent context). |
| include_history | boolean | No | Whether to include historical/superseded decisions. Defaults to false. |
| sections | string[] | No | List of specific section headings to retrieve. If omitted, all sections are returned. |

**Example:**
> "Show me the full context for the auth-service project"

**Returns:** The complete parsed BRIEF.md content organized by section, including project identity (what-this-is, what-this-is-not, why-this-exists), all decisions, constraints, open questions, and extension content. When `include_history` is true, superseded decisions are also included.

---

### `brief_get_constraints`

Read constraints from the project's BRIEF.md. Constraints can be inherited from parent projects in a hierarchy.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| project_path | string | No | Path to the project. Defaults to the active project. |
| scope | string | No | Scope for constraint retrieval. Controls whether inherited constraints from parent projects are included. |

**Example:**
> "What are the constraints for this project?"

**Returns:** A list of constraints, each with its text content and source (local or inherited from a specific parent). Inherited constraints are marked with their origin project path.

---

### `brief_get_decisions`

Read decisions from the project's BRIEF.md. Decisions can be filtered by status to show only active, superseded, or all decisions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| project_path | string | No | Path to the project. Defaults to the active project. |
| scope | string | No | Scope for decision retrieval. Controls whether inherited decisions from parent projects are included. |
| status | enum | No | Filter decisions by status. One of: `active` (current decisions), `superseded` (replaced decisions), `all` (both). Defaults to `active`. |

**Example:**
> "Show me all decisions, including superseded ones"

**Returns:** A list of decisions, each containing the title, rationale (why), date, any alternatives considered, and whether it replaces or creates an exception to another decision.

---

### `brief_get_questions`

Read questions from the project's BRIEF.md. Questions can be filtered by category to show only unresolved, intentionally open, resolved, or all questions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| project_path | string | No | Path to the project. Defaults to the active project. |
| scope | string | No | Scope for question retrieval. Controls whether questions from parent projects are included. |
| category | enum | No | Filter questions by category. One of: `to-resolve` (needs an answer), `to-keep-open` (intentionally deferred), `resolved` (answered), `all`. Defaults to `to-resolve`. |

**Example:**
> "What open questions does this project have?"

**Returns:** A list of questions, each containing the question text, category, options (if any), impact statement, priority level, and resolution details (for resolved questions).
