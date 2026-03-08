# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial MCP server implementation with BRIEF.md project context management
- Parser for BRIEF.md files with metadata, sections, decisions, and questions
- Hierarchy walker for upward traversal and context assembly
- Collection discovery for downward project scanning
- Workspace manager for project listing, filtering, and creation
- Context read and write tools for decisions, questions, constraints, and sections
- Ontology system with pack management, search, browsing, and tagging
- Reference system with reverse index, suggestions, and writing
- Type guide and extension support
- Conflict detection for decisions and constraints
- Lint tool for BRIEF.md validation
- CLI framework with setup wizard
- Signal handling, graceful shutdown, and crash recovery
- Bundled content and default ontology packs
- MCP resource for brief://guide
- Security: path validation, input sanitisation, resource limits
- Observability: structured logging infrastructure

## [0.1.0] - Unreleased

### Added
- Initial development release
- Full MCP server with BRIEF.md context management tools
- CLI with `brief-mcp` command and setup wizard
- Ontology pack system for domain knowledge
- Hierarchy-aware context assembly
- Conflict detection and lint validation
