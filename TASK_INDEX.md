# TASK INDEX

> **Purpose:** Master list of all tasks with priority, status, dependencies, and description. The build agent reads this to pick its next task. Only the status column is updated during the build loop.

| ID | Priority | Status | Dependencies | Description |
|----|----------|--------|-------------|-------------|
| TASK-01 | 1 | completed | none | Project scaffold & architecture |
| TASK-02 | 2 | completed | TASK-01 | Shared types & interfaces |
| TASK-03 | 3 | completed | TASK-01 | Logger & observability infrastructure |
| TASK-04 | 4 | completed | TASK-02, TASK-03 | Error handling framework |
| TASK-05a | 5 | completed | TASK-02, TASK-03, TASK-04 | Security — path validation & resource limits |
| TASK-05b | 6 | completed | TASK-05a | Security — input sanitisation & parameter validation |
| TASK-06 | 7 | completed | TASK-02, TASK-03, TASK-04, TASK-05a | Configuration manager |
| TASK-07 | 8 | completed | TASK-02, TASK-03, TASK-04, TASK-05a | File I/O utilities |
| TASK-08 | 9 | completed | TASK-01, TASK-02, TASK-03, TASK-04 | MCP server bootstrap |
| TASK-09 | 10 | completed | TASK-02, TASK-03, TASK-05b | Parser — metadata extraction |
| TASK-10 | 11 | completed | TASK-09 | Parser — sections & headings |
| TASK-11 | 12 | completed | TASK-10 | Parser — decisions & questions |
| TASK-12 | 13 | completed | TASK-10 | Parser — HTML comments & tags |
| TASK-13 | 14 | completed | TASK-09, TASK-10, TASK-11, TASK-12 | Parser — pre-processing & edge cases |
| TASK-14 | 15 | completed | TASK-03, TASK-07, TASK-09, TASK-10 | Writer — core write engine |
| TASK-15a | 16 | completed | TASK-14, TASK-11 | Writer — decision writing & supersession |
| TASK-15b | 17 | completed | TASK-15a | Writer — exceptions, amendments & question resolution |
| TASK-16 | 18 | completed | TASK-14 | Writer — metadata sync & section targeting |
| TASK-17 | 19 | completed | TASK-03, TASK-09, TASK-10, TASK-05a | Hierarchy walker — upward traversal |
| TASK-18 | 20 | completed | TASK-17, TASK-09, TASK-11 | Hierarchy walker — context assembly & formatting |
| TASK-19 | 21 | completed | TASK-09, TASK-05a | Collection discovery — downward scan |
| TASK-20 | 22 | completed | TASK-19, TASK-06, TASK-08 | Workspace manager — project listing & filtering |
| TASK-21 | 23 | completed | TASK-20, TASK-06 | Workspace manager — active project & workspace |
| TASK-22 | 24 | completed | TASK-14, TASK-21, TASK-05a | Workspace manager — project creation |
| TASK-23 | 25 | completed | TASK-06, TASK-18, TASK-24, TASK-30 | Workspace manager — re-entry & tutorial |
| TASK-24 | 26 | completed | TASK-18, TASK-08 | Context read tools |
| TASK-25 | 27 | completed | TASK-08 | MCP resource — brief://guide |
| TASK-26 | 28 | completed | TASK-15a, TASK-15b, TASK-08, TASK-30 | Context write — decisions |
| TASK-27 | 29 | completed | TASK-15b, TASK-08 | Context write — questions & constraints |
| TASK-28 | 30 | completed | TASK-14, TASK-16, TASK-08, TASK-30 | Context write — sections & external sessions |
| TASK-29 | 31 | completed | TASK-09, TASK-10, TASK-11, TASK-12, TASK-13, TASK-08, TASK-30 | Lint tool |
| TASK-30 | 32 | completed | TASK-11, TASK-18, TASK-08 | Conflict detection |
| TASK-31 | 33 | completed | TASK-04, TASK-05b, TASK-06 | Ontology pack schema validation & loading |
| TASK-32a | 34 | completed | TASK-31 | Ontology index building |
| TASK-32b | 35 | completed | TASK-32a | Ontology memory management & cache |
| TASK-33 | 36 | completed | TASK-32a, TASK-08 | Ontology search tool |
| TASK-34 | 37 | completed | TASK-31, TASK-08 | Ontology browsing & entry retrieval |
| TASK-35 | 38 | completed  | TASK-31, TASK-06, TASK-08 | Ontology pack management |
| TASK-36 | 39 | completed | TASK-16, TASK-31, TASK-08 | Ontology tagging tool |
| TASK-37 | 40 | completed | TASK-31, TASK-08 | Reverse reference index & lookup |
| TASK-38 | 41 | completed | TASK-37, TASK-08 | Reference suggestion & entry references |
| TASK-39 | 42 | completed | TASK-14, TASK-16, TASK-08 | Reference writing |
| TASK-40 | 43 | completed | TASK-06, TASK-08 | Type guide loading & resolution |
| TASK-41 | 44 | completed | TASK-40, TASK-14, TASK-08 | Type guide creation |
| TASK-42 | 45 | completed | TASK-40, TASK-08 | Extension suggestion |
| TASK-43 | 46 | completed | TASK-14, TASK-16, TASK-08 | Extension creation & listing |
| TASK-44 | 47 | completed | TASK-18, TASK-16, TASK-08 | Framework visibility & ontology management |
| TASK-46 | 48 | completed | TASK-24, TASK-08 | Tool response formatting & context blocks |
| TASK-47 | 49 | completed | TASK-01, TASK-03 | CLI framework |
| TASK-48 | 50 | completed | TASK-06, TASK-47, TASK-35 | Setup wizard |
| TASK-49 | 51 | completed | TASK-48, TASK-08 | Compatible MCP registry, add-tool & registry search |
| TASK-50 | 52 | completed | TASK-07, TASK-03, TASK-06 | Signal handling, graceful shutdown & crash recovery |
| TASK-52 | 53 | completed | TASK-13, TASK-19, TASK-32a, TASK-32b, TASK-33 | Performance verification & benchmarks |
| TASK-53 | 54 | completed | TASK-40, TASK-48 | Bundled content |
| TASK-54 | 55 | pending | TASK-20 through TASK-46 | Integration tests for interaction patterns |
| TASK-55 | 56 | pending | TASK-01 | npm package configuration |
| TASK-56 | 57 | pending | TASK-01, TASK-54 | CI/CD pipeline |
| TASK-57 | 58 | pending | TASK-07, TASK-05a | Platform testing |
