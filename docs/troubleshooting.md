# Troubleshooting

## Server Won't Start

### Node.js version too old

brief-mcp requires Node.js >= 20. The server enforces this at startup.

**Symptom**: Error message about Node.js version on startup.

**Fix**: Update Node.js to version 20 or later.

```bash
node --version  # Check current version
```

### MCP client configuration error

**Symptom**: The MCP client reports that the server failed to start or is not responding.

**Fix**: Verify your MCP client configuration:

- **Claude Desktop**: Check `claude_desktop_config.json` for correct JSON syntax and the right command/args
- **Claude Code**: Run `claude mcp list` to verify brief-mcp is registered
- **Cursor/Windsurf**: Check the MCP server settings in the IDE

Ensure the command is `npx` and the args include `"-y"` and `"brief-mcp"`:

```json
{
  "mcpServers": {
    "brief-mcp": {
      "command": "npx",
      "args": ["-y", "brief-mcp"]
    }
  }
}
```

## "No Active Project" Errors

**Symptom**: Tools return errors about no active project being set.

**Fix**: You must activate a project before using most tools. Either:

- Re-enter an existing project:
  ```
  Tool: brief_reenter_project
  Args: { "path": "/path/to/project" }
  ```

- Set a project as active:
  ```
  Tool: brief_set_active_project
  Args: { "path": "/path/to/project" }
  ```

- Create a new project (which auto-activates it):
  ```
  Tool: brief_create_project
  Args: { "path": "/path/to/project", "name": "My Project" }
  ```

## Empty Sections After Project Creation

**Symptom**: The BRIEF.md is created but all sections are empty or contain only placeholders.

**Explanation**: This is expected. After project creation, the server enters the setup phase flow. The AI assistant is supposed to guide you through populating sections using collaborative authoring (Pattern 8).

**Fix**: Follow the setup phase flow:
1. Describe what the project is (needs_identity phase)
2. Choose a type guide (choose_type_guide phase)
3. Explore the guide's dimensions (explore_type phase)
4. Review suggested extensions and ontologies (review_suggestions phase)

The sections get populated through conversation, not automatically.

## Ontology Not Found

**Symptom**: Ontology search returns no results, or a specific pack is not available.

**Fix**:

1. Check installed ontologies:
   ```
   Tool: brief_list_ontologies
   ```

2. If the pack is not installed, install it:
   ```
   Tool: brief_install_ontology
   Args: { "source": "/path/to/pack.json" }
   ```

3. If searching returns no results, try broader keywords or check the pack's entry IDs with `brief_list_ontology_columns`.

## Permission Errors

**Symptom**: Errors about file access or directory permissions.

**Fix**:

- Verify the project directory exists and is writable
- Check that `~/.brief/` (or `$BRIEF_HOME`) is accessible
- On Unix systems, ensure the config directory has `0700` permissions
- On Windows, check that the user has write access to the project and config directories

If the config directory is owned by a different user (e.g., created with sudo):

```bash
# Unix/macOS
chown -R $(whoami) ~/.brief/
```

## Large BRIEF.md Files

**Symptom**: Slow performance or errors when working with large BRIEF.md files.

brief-mcp enforces these limits:

| Limit | Value |
|-------|-------|
| Maximum file size | 10 MB |
| Maximum sections | 500 |
| Maximum chain depth (decision supersession chains) | 100 |

**Fix**:

- Split large projects into sub-projects using `brief_create_sub_project`
- Archive old decisions that are no longer relevant
- Use structured sections (linked to ontology datasets) instead of long freeform sections

## Debug Logging

When investigating issues, enable debug logging for more detailed output.

### Via environment variable

```bash
BRIEF_LOG_LEVEL=debug npx brief-mcp
```

### Via CLI flag

```bash
npx brief-mcp --verbose
```

### Via config file

Set `log_level` to `"debug"` in `~/.brief/config.json`:

```json
{
  "log_level": "debug"
}
```

Debug logs are written to stderr (not stdout, which is reserved for the MCP protocol). They include:
- Tool call details and timing
- File read/write operations
- Config loading and validation
- Hierarchy traversal steps
- Ontology search results

### Trace-level logging

For maximum detail, use `"trace"` level:

```bash
BRIEF_LOG_LEVEL=trace npx brief-mcp
```

This includes all debug output plus low-level protocol messages.
