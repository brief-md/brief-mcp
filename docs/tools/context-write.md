# Context Writing Tools

These are the note-taking tools — they capture decisions, constraints, questions, and section content as you chat, so nothing important is lost when the conversation ends or the context window compacts.

---

### `brief_add_decision`

Record a decision in the project's BRIEF.md. Decisions capture architectural and design choices along with their rationale.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| title | string | Yes | Short title summarizing the decision (e.g., "Use PostgreSQL for persistence"). |
| project_path | string | No | Path to the project. Defaults to the active project. |
| why | string | No | Rationale explaining why this decision was made. |
| when | string | No | Context or conditions under which this decision applies. |
| alternatives_considered | string | No | Description of alternatives that were evaluated and why they were rejected. |
| replaces | string | No | Title of a previous decision that this one supersedes. The old decision will be marked as superseded. |
| exception_to | string | No | Title of a constraint or decision that this creates an exception to. |
| date | string | No | Date the decision was made. Defaults to today's date. |

**Example:**
> "Record a decision: Use Redis for session caching because it provides sub-millisecond latency and we need fast session lookups"

**Returns:** Confirmation that the decision was added, along with the formatted decision entry as it appears in BRIEF.md.

---

### `brief_add_constraint`

Add a constraint to the project's BRIEF.md. Constraints are non-negotiable boundaries that all work must respect.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| constraint | string | Yes | The constraint text (e.g., "Must support IE11", "No external API calls from the frontend"). |
| project_path | string | No | Path to the project. Defaults to the active project. |
| section | string | No | The section heading under which to place the constraint. Defaults to the main constraints section. |

**Example:**
> "Add a constraint: All API responses must be under 200ms at the 95th percentile"

**Returns:** Confirmation that the constraint was added to BRIEF.md.

---

### `brief_add_question`

Record a question in the project's BRIEF.md. Questions capture unknowns that need resolution or are intentionally kept open.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | string | Yes | The question text. |
| project_path | string | No | Path to the project. Defaults to the active project. |
| category | enum | No | One of: `to-resolve` (needs an answer) or `to-keep-open` (intentionally deferred). Defaults to `to-resolve`. |
| options | string[] | No | List of possible answers or approaches being considered. |
| impact | string | No | Description of what this question blocks or affects. |
| priority | enum | No | Priority level. One of: `high`, `medium`, `low`. |

**Example:**
> "Add a question: Should we use GraphQL or REST for the public API? Options are GraphQL and REST. This is high priority because it affects the entire client SDK."

**Returns:** Confirmation that the question was recorded, along with the formatted entry.

---

### `brief_resolve_question`

Resolve a previously recorded question by marking it as answered and optionally recording the decision.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | string | Yes | The question text to resolve. Must match an existing question. |
| project_path | string | No | Path to the project. Defaults to the active project. |
| decision | string | No | The answer or decision that resolves this question. |
| section | string | No | The section where the resolution should be recorded. |

**Example:**
> "Resolve the question about GraphQL vs REST -- we decided to use REST for simplicity"

**Returns:** Confirmation that the question was moved to the resolved category with the recorded decision.

---

### `brief_capture_external_session`

Record a summary of work done in an external tool (e.g., a design tool, a whiteboard session, a meeting). This creates a breadcrumb in the BRIEF.md so that context is not lost when switching between tools.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| tool_name | string | Yes | Name of the external tool (e.g., "Figma", "Miro", "Zoom meeting"). |
| summary | string | Yes | Summary of what was discussed or decided during the session. |
| project_path | string | No | Path to the project. Defaults to the active project. |
| date | string | No | Date of the session. Defaults to today. |
| breadcrumb | string | No | A short breadcrumb label for quick reference. |
| decisions | object[] | No | List of decisions made during the session. Each object should contain at minimum a `title` field, and optionally `why`, `alternatives_considered`, etc. |

**Example:**
> "Capture that we had a Figma session today where we finalized the dashboard layout and decided to use a sidebar navigation pattern"

**Returns:** Confirmation that the external session was recorded, including any decisions that were extracted and added to the decisions section.

---

### `brief_update_section`

Update the content of a specific section in the BRIEF.md file. This replaces the content under a given heading with new content.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| heading | string | Yes | The section heading to update (e.g., "What This Is", "Architecture"). |
| content | string | Yes | The new content for the section. Replaces existing content under this heading. |
| project_path | string | No | Path to the project. Defaults to the active project. |
| extension | string | No | If the section belongs to an extension, specify the extension name. |

**Example:**
> "Update the 'What This Is' section to say: A real-time collaborative document editor built on CRDTs"

**Returns:** Confirmation that the section was updated, along with the new section content as it appears in BRIEF.md.
