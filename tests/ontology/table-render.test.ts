import { describe, expect, it } from "vitest";
import {
  appendTableRow,
  parseTableRows,
  renderFullTable,
  renderTableHeader,
  renderTableRow,
} from "../../src/ontology/table-render";

describe("table-render: renderTableHeader", () => {
  it("renders header with separator", () => {
    const result = renderTableHeader(["name", "description"]);
    expect(result).toBe("| name | description |\n| --- | --- |");
  });

  it("handles single column", () => {
    const result = renderTableHeader(["label"]);
    expect(result).toBe("| label |\n| --- |");
  });
});

describe("table-render: renderTableRow", () => {
  it("renders string values", () => {
    const result = renderTableRow({ name: "test", description: "a thing" }, [
      "name",
      "description",
    ]);
    expect(result).toBe("| test | a thing |");
  });

  it("joins array values with semicolons", () => {
    const result = renderTableRow({ name: "test", parents: ["a", "b", "c"] }, [
      "name",
      "parents",
    ]);
    expect(result).toBe("| test | a; b; c |");
  });

  it("renders empty string for missing fields", () => {
    const result = renderTableRow({ name: "test" }, ["name", "keywords"]);
    expect(result).toBe("| test |  |");
  });

  it("escapes pipe characters in values", () => {
    const result = renderTableRow({ name: "a | b" }, ["name"]);
    expect(result).toBe("| a \\| b |");
  });

  it("strips newlines from values", () => {
    const result = renderTableRow({ name: "line1\nline2" }, ["name"]);
    expect(result).toBe("| line1 line2 |");
  });
});

describe("table-render: renderFullTable", () => {
  it("renders header + rows", () => {
    const entries = [
      { name: "alpha", desc: "first" },
      { name: "beta", desc: "second" },
    ];
    const result = renderFullTable(entries, ["name", "desc"]);
    expect(result).toBe(
      "| name | desc |\n| --- | --- |\n| alpha | first |\n| beta | second |",
    );
  });

  it("renders header only for empty entries", () => {
    const result = renderFullTable([], ["name"]);
    expect(result).toBe("| name |\n| --- |");
  });
});

describe("table-render: parseTableRows", () => {
  it("parses a table back to row objects", () => {
    const table =
      "| name | desc |\n| --- | --- |\n| alpha | first |\n| beta | second |";
    const rows = parseTableRows(table);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "alpha", desc: "first" });
    expect(rows[1]).toEqual({ name: "beta", desc: "second" });
  });

  it("returns empty array for no table", () => {
    expect(parseTableRows("just some text")).toEqual([]);
  });

  it("returns empty array for header-only table", () => {
    expect(parseTableRows("| name |\n| --- |")).toEqual([]);
  });
});

describe("table-render: appendTableRow", () => {
  const entry = { name: "test", desc: "a thing" };
  const columns = ["name", "desc"];
  const tag = '<!-- brief:ontology pack test "test" -->';

  it("creates table when none exists", () => {
    const content = "## My Section\n\n*Some guidance text*\n";
    const result = appendTableRow(content, entry, columns, tag);
    expect(result).toContain("| name | desc |");
    expect(result).toContain("| --- | --- |");
    expect(result).toContain("| test | a thing |");
    expect(result).toContain(tag);
  });

  it("appends row to existing table", () => {
    const content = [
      "## My Section",
      "",
      "| name | desc |",
      "| --- | --- |",
      "| first | entry |",
      '<!-- brief:ontology pack first "first" -->',
      "",
    ].join("\n");
    const result = appendTableRow(content, entry, columns, tag);
    expect(result).toContain("| first | entry |");
    expect(result).toContain("| test | a thing |");
    expect(result).toContain(tag);
    // Should have both rows
    const tableRows = result
      .split("\n")
      .filter((l) => l.startsWith("| ") && !l.startsWith("| ---"));
    // header + 2 data rows = 3 lines starting with |
    expect(tableRows.length).toBe(3);
  });
});
