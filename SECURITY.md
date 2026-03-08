# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in brief-mcp, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. Email: Send a detailed report to the project maintainers via the security contact listed in the repository
2. GitHub Security Advisories: Use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) feature on this repository

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours of report
- **Assessment**: Within 7 days
- **Fix**: Critical vulnerabilities patched within 14 days
- **Disclosure**: Coordinated disclosure after fix is released

### Security Update Policy

- Security patches are released as patch versions (e.g., 0.1.1)
- Critical vulnerabilities trigger an immediate patch release
- Users are notified via GitHub releases and CHANGELOG.md
- All dependencies are audited regularly via `npm audit`

## Security Design

brief-mcp implements several security measures:

- **Path validation**: All file paths are validated and resolved to prevent directory traversal
- **Input sanitisation**: All user inputs are sanitised to prevent injection attacks
- **Resource limits**: File size (10MB), section count (500), and chain depth (100) limits
- **No external calls**: The server makes no external HTTP or AI API calls (ARCH-01, ARCH-02)
- **Atomic writes**: All file writes use temp-file-then-rename pattern to prevent data corruption
- **npm provenance**: Published packages include build attestation via `--provenance`
