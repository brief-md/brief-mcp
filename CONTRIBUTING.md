# Contributing to brief-mcp

Thank you for your interest in contributing to brief-mcp.

## Reporting Bugs

Open a [GitHub Issue](https://github.com/brief-md/brief-mcp/issues) with:

- Description of the problem
- Steps to reproduce
- Expected vs actual behaviour
- Environment: Node.js version, OS, MCP client (Claude Desktop, Claude Code, etc.)

## Suggesting Features

Open a [GitHub Issue](https://github.com/brief-md/brief-mcp/issues) with the `enhancement` label. Describe the problem you're solving and your proposed approach.

## Development Setup

```bash
# Prerequisites: Node.js >= 20

# Clone and install
git clone https://github.com/brief-md/brief-mcp.git
cd brief-mcp
npm install

# Run tests
npm test

# Lint
npm run lint

# Type check
npm run typecheck

# Build
npm run build

# Watch mode
npm run dev
```

## Code Style

This project uses [Biome](https://biomejs.dev/) for linting and formatting. Run `npm run lint` to check your code. The pre-commit hook runs Biome and TypeScript type checking automatically.

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `perf:` — performance improvement
- `docs:` — documentation changes
- `test:` — test additions or changes
- `chore:` — maintenance (dependencies, CI, etc.)
- `refactor:` — code restructuring without behaviour change

## Pull Request Process

1. Fork the repository and create a feature branch
2. Make your changes with tests
3. Ensure all checks pass: `npm run lint && npm run typecheck && npm test`
4. Submit a pull request against `main`

CI runs lint, typecheck, and tests on Node 20/22 across Ubuntu, macOS, and Windows. All checks must pass before merge.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.
