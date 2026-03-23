# Ontology System Guide

## What Are Ontology Packs?

Ontology packs provide shared vocabulary for specific domains. Each pack contains a collection of **entries** -- named concepts with properties and relationships.

For example, a music theory ontology pack might include entries for:
- Scales (Major, Minor, Dorian, Mixolydian...)
- Chord types (Major 7th, Dominant 7th, Diminished...)
- Instruments (grouped by family: strings, brass, woodwinds...)

Each entry can have:
- A unique ID
- A human-readable label
- Parent/child relationships to other entries
- Additional columns (properties specific to the domain)

## Installing Packs

Install ontology packs from three sources:

### From a local path

```
Tool: brief_install_ontology
Args: { "source": "/path/to/my-ontology.json" }
```

### From a URL

```
Tool: brief_install_ontology
Args: { "source": "https://example.com/ontology-pack.json" }
```

### From Hugging Face

```
Tool: brief_install_ontology
Args: { "source": "hf://username/dataset-name" }
```

### Managing packs

List installed packs:
```
Tool: brief_list_ontologies
```

Remove a pack:
```
Tool: brief_remove_ontology
Args: { "packId": "music-theory" }
```

## Searching and Browsing

### Keyword search

Search across all installed packs by keyword:

```
Tool: brief_search_ontology
Args: { "query": "minor scale" }
```

Returns matching entries with relevance scores.

### Neighborhood browsing

Start from an entry and explore its relationships:

```
Tool: brief_browse_ontology
Args: { "entryId": "dorian-mode", "packId": "music-theory" }
```

Returns the entry along with its parent entries and child entries, allowing you to navigate the ontology graph.

### Listing columns

See what properties are available in a pack:

```
Tool: brief_list_ontology_columns
Args: { "packId": "music-theory" }
```

## Tagging Sections

Link ontology entries to BRIEF.md sections to create a semantic connection between your project documentation and domain vocabulary.

### Add a tag

```
Tool: brief_tag_entry
Args: {
  "section": "Sound Palette",
  "entryId": "dorian-mode",
  "packId": "music-theory"
}
```

### List tags

```
Tool: brief_list_tags
```

### Remove a tag

```
Tool: brief_remove_tag
Args: { "section": "Sound Palette", "entryId": "dorian-mode" }
```

## Creating Custom Packs

Create a custom ontology pack for your domain:

```
Tool: brief_create_ontology
Args: {
  "name": "My Domain Vocabulary",
  "description": "Custom ontology for...",
  "entries": [
    {
      "id": "entry-1",
      "label": "Concept A",
      "parent": null
    },
    {
      "id": "entry-2",
      "label": "Concept B",
      "parent": "entry-1"
    }
  ]
}
```

For iterative creation, use the interactive draft builder:

```
Tool: brief_ontology_draft
Args: { "action": "start", "name": "My Ontology" }
```

Then add entries incrementally and finalize when ready.

## Structured Sections

Ontology packs can power structured subsections in your BRIEF.md. Instead of freeform text, a section is linked to an ontology dataset and rendered as a markdown table.

### Link a section to a dataset

```
Tool: brief_link_section_dataset
Args: {
  "section": "Sound Palette",
  "packId": "music-theory",
  "columns": ["label", "category", "notes"]
}
```

### Convert an existing section

```
Tool: brief_convert_to_structured
Args: { "section": "Sound Palette" }
```

### Preview a dataset

```
Tool: brief_preview_dataset
Args: { "packId": "music-theory", "limit": 20 }
```

## Dataset Discovery and Conversion

Find ontology packs and datasets from external sources:

### Discover ontologies

```
Tool: brief_discover_ontologies
Args: { "query": "music production" }
```

Searches both local installed packs and external sources (including Hugging Face datasets).

### Fetch a dataset

```
Tool: brief_fetch_dataset
Args: { "source": "hf://username/dataset-name" }
```

Downloads and converts external datasets into the ontology pack format for installation.
