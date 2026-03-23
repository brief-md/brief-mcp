# Hierarchy Tools

2 tools for navigating and visualizing project hierarchies.

---

### `brief_where_am_i`

Show the current project's position within its hierarchy. Displays the parent chain (ancestors) and immediate children, along with the project's type and identity at each level.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| project_path | string | No | Path to the project. Defaults to the active project. |

**Example:**
> "Where am I in the project hierarchy?"

**Returns:** The project's position in the hierarchy including: the current project's name and type, the full parent chain up to the root, immediate child projects (if any), and inherited constraints from ancestors.

---

### `brief_hierarchy_tree`

Build an ASCII tree visualization of the entire project hierarchy from a given root. Useful for understanding the structure of a multi-project workspace at a glance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| root_path | string | No | Path to the root project from which to build the tree. Defaults to the topmost ancestor of the active project. |

**Example:**
> "Show me the project hierarchy as a tree"

**Returns:** An ASCII tree representation of the hierarchy, showing each project with its name, type, and nesting depth. For example:
```
platform (monorepo)
├── api-gateway (api)
├── auth-service (api)
│   └── auth-sdk (library)
└── web-app (web-app)
```
