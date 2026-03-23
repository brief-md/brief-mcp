# brief-mcp Documentation

`brief-mcp` is a note taker while you chat, and a boot loader when you start a new session. It captures your project's decisions, constraints, and open questions into a structured [BRIEF.md](https://github.com/brief-md/spec) file as you work — so every session starts with context, not a blank slate.

## Table of Contents

### Fundamentals

- [Getting Started](getting-started.md) -- Installation, MCP client setup, first project walkthrough
- [Core Concepts](concepts.md) -- BRIEF.md format, project hierarchy, lifecycle, decisions, questions, extensions

### Tool Reference

- [Tool Reference](tools/README.md) -- Complete reference for all 57 tools exposed by the server

### Guides

- [Interaction Patterns](guides/interaction-patterns.md) -- The 11 session patterns for working with brief-mcp
- [Decision Recognition Rules](guides/decision-rules.md) -- DR-01 through DR-09: detecting and recording decisions
- [Question Surfacing Rules](guides/question-rules.md) -- QUEST-01 through QUEST-12: surfacing and managing questions
- [Ontology System](guides/ontology-system.md) -- Shared vocabulary packs: installing, searching, tagging, creating
- [Extensions](guides/extensions.md) -- Built-in and custom extensions for domain-specific sections
- [Type Guides](guides/type-guides.md) -- Domain-specific project templates and workflows
- [Conflict Detection](guides/conflict-detection.md) -- Cross-hierarchy and within-project conflict detection

### Reference

- [Configuration](configuration.md) -- Config file, environment variables, CLI flags
- [Transport & Remote Access](transport.md) -- stdio transport, remote access patterns, HTTP/SSE roadmap
- [BRIEF.md Specification](specification.md) -- The BRIEF.md file format specification
- [Implementation Guide](implementation-guide.md) -- Integration and implementation details
- [Troubleshooting](troubleshooting.md) -- Common issues and solutions
