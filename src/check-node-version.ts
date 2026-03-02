/**
 * Checks that the running Node.js version meets the minimum major version.
 * Writes a warning to stderr and exits with code 1 if the requirement is not met.
 *
 * @param minimum - The minimum required Node.js major version (e.g. 20)
 * @param version - The version string to check (defaults to process.versions.node)
 */
export function checkNodeVersion(
  minimum: number,
  version: string = process.versions.node,
): void {
  const majorStr = version.split(".")[0];
  const major = Number(majorStr);
  if (major < minimum) {
    process.stderr.write(
      `[brief-mcp] Node.js ${minimum}+ required (current: ${version})\n`,
    );
    process.exit(1);
  }
}
