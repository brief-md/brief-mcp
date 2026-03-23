# BRIEF MCP Server - Tool Reference

Complete reference for all 57 tools exposed by the `brief-mcp` MCP server.

## Tool Categories

### [Workspace Management](workspace.md) (9 tools)
Project lifecycle: listing, creating, activating, and re-entering projects.

| Tool | Purpose |
|------|---------|
| `brief_list_projects` | List projects in a workspace |
| `brief_set_active_project` | Set the active project |
| `brief_create_project` | Create a new project |
| `brief_create_sub_project` | Create a child project |
| `brief_create_parent_project` | Create a parent project above an existing one |
| `brief_reenter_project` | Re-enter an existing project (session start) |
| `brief_start_tutorial` | Start the onboarding tutorial |
| `brief_set_tutorial_dismissed` | Dismiss the tutorial |
| `brief_add_workspace` | Register a workspace root |

### [Context Reading](context-read.md) (4 tools)
Read context, constraints, decisions, and questions from BRIEF.md files.

| Tool | Purpose |
|------|---------|
| `brief_get_context` | Read the full project context |
| `brief_get_constraints` | Read project constraints |
| `brief_get_decisions` | Read project decisions |
| `brief_get_questions` | Read project questions |

### [Context Writing](context-write.md) (6 tools)
Add decisions, constraints, questions, and update sections.

| Tool | Purpose |
|------|---------|
| `brief_add_decision` | Record a decision |
| `brief_add_constraint` | Add a constraint |
| `brief_add_question` | Record a question |
| `brief_resolve_question` | Resolve a question |
| `brief_capture_external_session` | Record an external tool session |
| `brief_update_section` | Update section content |

### [Validation](validation.md) (2 tools)
Lint BRIEF.md files and check for conflicting decisions.

| Tool | Purpose |
|------|---------|
| `brief_lint` | Lint a BRIEF.md file |
| `brief_check_conflicts` | Check for conflicting decisions |

### [Hierarchy](hierarchy.md) (2 tools)
Navigate and visualize project hierarchies.

| Tool | Purpose |
|------|---------|
| `brief_where_am_i` | Show position in the hierarchy |
| `brief_hierarchy_tree` | Build an ASCII tree view |

### [Ontology](ontology.md) (13 tools)
Search, browse, install, create, and tag ontology packs.

| Tool | Purpose |
|------|---------|
| `brief_search_ontology` | Search ontology packs |
| `brief_get_ontology_entry` | Get an entry by ID |
| `brief_browse_ontology` | Browse an entry's neighborhood |
| `brief_list_ontologies` | List ontology packs |
| `brief_install_ontology` | Install an ontology pack |
| `brief_remove_ontology` | Remove an ontology pack |
| `brief_create_ontology` | Create a custom ontology pack |
| `brief_ontology_draft` | Interactive ontology builder |
| `brief_tag_entry` | Tag a section with an ontology entry |
| `brief_list_tags` | List tags in a project |
| `brief_remove_tag` | Remove a tag |
| `brief_list_ontology_columns` | List columns in an ontology |
| `brief_discover_ontologies` | Search local and external ontologies |

### [References](references.md) (5 tools)
Manage and discover references linked to BRIEF.md sections.

| Tool | Purpose |
|------|---------|
| `brief_add_reference` | Add a reference |
| `brief_get_entry_references` | Get references by ontology entry |
| `brief_suggest_references` | Suggest references for a context |
| `brief_lookup_reference` | Lookup by creator or title |
| `brief_discover_references` | Build a reference search query |

### [Extensions & Type Guides](extensions.md) (13 tools)
Manage extensions, type guides, and structured sections.

| Tool | Purpose |
|------|---------|
| `brief_suggest_extensions` | Suggest extensions for a project type |
| `brief_design_extension` | Design a custom extension |
| `brief_add_extension` | Add an extension to BRIEF.md |
| `brief_list_extensions` | List active extensions |
| `brief_remove_extension` | Remove an extension |
| `brief_get_type_guide` | Get a type guide |
| `brief_create_type_guide` | Create a type guide |
| `brief_suggest_type_guides` | Search type guides |
| `brief_apply_type_guide` | Apply a type guide to a project |
| `brief_link_section_dataset` | Link a section to an ontology dataset |
| `brief_convert_to_structured` | Convert a section to structured format |
| `brief_preview_dataset` | Preview an ontology dataset |
| `brief_fetch_dataset` | Fetch a dataset from a source |

### [Discovery](discovery.md) (3 tools)
Detect frameworks, assess maturity, and search the registry.

| Tool | Purpose |
|------|---------|
| `brief_get_project_frameworks` | Detect project frameworks |
| `brief_get_maturity_signals` | Get project maturity signals |
| `brief_search_registry` | Search the extension/ontology registry |

---

**Total: 57 tools**
