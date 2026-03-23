# Extensions Guide

Extensions add domain-specific sections to a BRIEF.md file. They provide structured vocabulary and subsections tailored to particular project types.

## Built-in Extensions

### 1. SONIC ARTS

For music, audio, and sound design projects.

| Subsection | Purpose |
|------------|---------|
| **Sound Palette** | Instruments, textures, and timbral choices |
| **Production Approach** | Recording, synthesis, and production methodology |
| **Mix Philosophy** | Mixing strategy, spatial placement, dynamic range |
| **Sonic References** | Reference tracks, tonal targets, inspiration |
| **Technical Setup** | DAW, plugins, hardware, signal chain |

### 2. NARRATIVE CREATIVE

For storytelling projects (novels, screenplays, games).

| Subsection | Purpose |
|------------|---------|
| **Story Structure** | Plot architecture, act structure, narrative arc |
| **Character Profiles** | Character descriptions, motivations, relationships |
| **World Building** | Setting, rules, history, geography |
| **Narrative Voice** | Point of view, tone, style |
| **Thematic Elements** | Central themes, motifs, symbols |

### 3. LYRICAL CRAFT

For songwriting and poetry projects.

| Subsection | Purpose |
|------------|---------|
| **Lyrical Theme** | Central message, emotional core |
| **Rhyme Scheme** | Rhyme patterns, internal rhymes, near rhymes |
| **Imagery Bank** | Metaphors, similes, sensory language |
| **Emotional Arc** | Emotional progression through the piece |
| **Structural Form** | Verse/chorus structure, stanza patterns |

### 4. VISUAL STORYTELLING

For film, video, and visual media projects.

| Subsection | Purpose |
|------------|---------|
| **Visual Style** | Aesthetic direction, visual references |
| **Shot Composition** | Framing, camera movement, lens choices |
| **Editing Approach** | Pacing, transitions, montage style |
| **Color and Mood** | Color palette, grading approach, mood boards |
| **Narrative Flow** | Visual narrative structure, scene sequencing |

### 5. STRATEGIC PLANNING

For business strategy and planning projects.

| Subsection | Purpose |
|------------|---------|
| **Strategic Goals** | Objectives, KPIs, success criteria |
| **Stakeholder Map** | Key stakeholders, interests, influence |
| **Resource Plan** | Budget, team, timeline, dependencies |
| **Risk Register** | Identified risks, probability, mitigation |
| **Success Metrics** | Measurable outcomes, tracking approach |

### 6. SYSTEM DESIGN

For software architecture and system design projects.

| Subsection | Purpose |
|------------|---------|
| **Architecture Overview** | High-level system architecture, component map |
| **Component Design** | Individual component responsibilities and interfaces |
| **Data Model** | Database schema, data relationships, storage strategy |
| **Interface Contracts** | API contracts, message formats, protocols |
| **Scalability Plan** | Scaling strategy, bottleneck analysis, capacity planning |

## Designing Custom Extensions

You can create extensions tailored to your specific domain.

### Using the design tool

```
Tool: brief_design_extension
Args: {
  "name": "GAME DESIGN",
  "description": "Extension for game design projects",
  "subsections": [
    { "name": "Core Mechanics", "type": "freeform", "description": "Primary gameplay loops and systems" },
    { "name": "Player Experience", "type": "freeform", "description": "Target emotions and player journey" },
    { "name": "Level Design", "type": "structured", "description": "Level structure and progression" }
  ]
}
```

### Subsection types

Each subsection in an extension has a type:

- **Freeform** -- Free-text content. The user writes narrative descriptions, lists, or any markdown content. Best for qualitative, descriptive content.
- **Structured** -- Linked to an ontology dataset. Content is rendered as a markdown table with columns defined by the ontology. Best for quantitative, categorical, or relational content.

## The 8-Step Extension Setup Workflow

Adding an extension to a project follows this workflow:

1. **Suggest** -- Call `brief_suggest_extensions` to get extension recommendations based on the project type. The server considers the project's type guide and existing extensions.

2. **Review** -- Present the suggested extensions to the user with their descriptions and subsection lists. Explain what each extension adds.

3. **Select** -- The user chooses which extensions to add. They may want all, some, or none of the suggestions. They may also want a custom extension.

4. **Design** (optional) -- If the user wants a custom extension, use `brief_design_extension` to collaboratively define its name, description, and subsections.

5. **Confirm** -- Before adding, review the extension's subsections with the user. Confirm they want all subsections or if they want to modify the set.

6. **Add** -- Call `brief_add_extension` to install the extension into the BRIEF.md. This adds the extension name to the metadata and creates empty subsection headers.

7. **Populate** -- Use collaborative section authoring (Pattern 8) to fill in each subsection. Go through them one by one, using the ask-listen-reflect-refine cycle.

8. **Validate** -- Check that key subsections have meaningful content. Flag any subsections that are still empty and ask if they should be populated or removed.

## Managing Extensions

### List active extensions

```
Tool: brief_list_extensions
```

### Remove an extension

```
Tool: brief_remove_extension
Args: { "name": "SONIC ARTS" }
```

Removing an extension removes it from the metadata. The section content remains in the BRIEF.md for reference but is no longer treated as an active extension.
