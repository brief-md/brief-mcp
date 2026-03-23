# Workspace Management Tools

9 tools for project lifecycle management: listing, creating, activating, and re-entering projects.

---

### `brief_list_projects`

List all projects discovered in a workspace or across all registered workspaces.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| workspace | string | No | Path to a specific workspace to list projects from. If omitted, lists projects across all registered workspaces. |
| recursive | boolean | No | Whether to recursively search for nested sub-projects. Defaults to false. |

**Example:**
> "What projects do I have?"

**Returns:** A list of discovered projects with their paths, types, and hierarchy relationships.

---

### `brief_set_active_project`

Set the active project for subsequent tool calls. Most tools operate on the active project by default when no explicit project path is provided.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | Yes | Absolute path to the project directory to set as active. |

**Example:**
> "Switch to my API project at /home/user/projects/my-api"

**Returns:** Confirmation that the active project has been set, along with a summary of the project.

---

### `brief_create_project`

Create a new project by generating a BRIEF.md file with the appropriate structure for the given project type.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | The project name. Used as the top-level heading in BRIEF.md. |
| type | string | Yes | The project type (e.g., "web-app", "cli-tool", "library", "api"). Determines default structure and suggested extensions. |
| workspace | string | No | Path to the workspace where the project should be created. Defaults to the current workspace. |
| extensions | string[] | No | List of extension names to include in the initial BRIEF.md. |

**Example:**
> "Create a new project called 'payment-service' of type 'api'"

**Returns:** The path to the created project and the generated BRIEF.md content.

---

### `brief_create_sub_project`

Create a sub-project (child) within the hierarchy. The child project inherits constraints from its parent and can be navigated via hierarchy tools.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | The sub-project name. |
| type | string | Yes | The sub-project type. |
| parent_path | string | No | Path to the parent project. Defaults to the active project. |

**Example:**
> "Create a sub-project called 'auth-module' of type 'library' under the current project"

**Returns:** The path to the created sub-project and its BRIEF.md content, including its position in the hierarchy.

---

### `brief_create_parent_project`

Create a parent project above an existing project. This wraps an existing standalone project into a hierarchy by creating a parent directory with its own BRIEF.md.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| child_path | string | Yes | Path to the existing project that will become the child. |
| parent_directory | string | Yes | Path where the parent project directory should be created. |
| name | string | Yes | The parent project name. |
| type | string | Yes | The parent project type (e.g., "monorepo", "organization"). |
| display_name | string | No | Human-readable display name for the parent project. |
| what_this_is | string | No | Description of what this parent project is. |
| what_this_is_not | string | No | Description of what this parent project is not. |
| why_this_exists | string | No | Explanation of why this parent project exists. |

**Example:**
> "Create a parent project called 'platform' of type 'monorepo' above my current project"

**Returns:** The path to the created parent project, its BRIEF.md content, and the updated hierarchy.

---

### `brief_reenter_project`

Re-enter an existing project to load its context into the current session. This is the recommended way to start every new session -- it loads the BRIEF.md, active decisions, open questions, and any relevant hierarchy context.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | No | Path to the project to re-enter. Defaults to the active project or auto-detects from the current working directory. |
| detail | enum | No | Level of detail in the response. `summary` returns a condensed overview. `detailed` returns the full context. Defaults to `summary`. |

**Example:**
> "Re-enter the project" or "Load the project context"

**Returns:** The full project context including identity, decisions, constraints, open questions, extension content, and hierarchy position. The detail level controls how much is returned.

---

### `brief_start_tutorial`

Start the onboarding tutorial for new users. Walks through the core concepts of BRIEF projects, extensions, ontologies, and hierarchy.

**Parameters:**

None.

**Example:**
> "Start the tutorial" or "Help me learn how to use BRIEF"

**Returns:** The first step of the interactive tutorial sequence.

---

### `brief_set_tutorial_dismissed`

Dismiss the onboarding tutorial so it no longer appears on project re-entry.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| dismissed | boolean | Yes | Set to `true` to dismiss the tutorial, `false` to re-enable it. |

**Example:**
> "Dismiss the tutorial"

**Returns:** Confirmation that the tutorial dismissed state has been updated.

---

### `brief_add_workspace`

Register a workspace root directory. Workspaces are top-level directories that contain one or more projects. Registering a workspace allows `brief_list_projects` to discover projects within it.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | Yes | Absolute path to the workspace root directory. |

**Example:**
> "Register /home/user/projects as a workspace"

**Returns:** Confirmation that the workspace has been registered, along with any projects discovered within it.
