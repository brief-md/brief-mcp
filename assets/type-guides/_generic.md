---
type: _generic
bootstrapping: true
source: bundled
version: "1.0"
---

# Generic Project Guide

This is the adaptive generic type guide for BRIEF. It provides universal project dimensions that apply to any project type. When no domain-specific type guide exists, this guide drives the initial setup conversation.

## Universal Project Dimensions

The following 10 dimensions apply to every project, regardless of domain:

### Purpose

What is the core goal or mission of this project? What problem does it solve or what value does it create?

### Audience

Who is the intended audience, user base, or stakeholder group? What are their needs and expectations?

### Tone

What is the desired voice, mood, or communication style? How should the project feel to its audience?

### Structure

How is the project organized? What are the key components, layers, or architectural patterns?

### Scope

What are the boundaries of the project? What is included and explicitly excluded?

### Identity

What makes this project unique? What is its brand, personality, or distinguishing character?

### Vision

What is the long-term aspiration? Where should this project be in the future?

### Direction

What is the current trajectory? What are the immediate next steps and near-term priorities?

### Constraints

What limitations, requirements, or non-negotiable rules govern the project?

### Timeline

What are the key milestones, deadlines, or temporal boundaries?

## Notes for AI

This is an adaptive generic guide. When `bootstrapping: true` is set:

1. Use these 10 Universal Dimensions to drive the initial project setup conversation
2. Ask the user about each dimension to understand their project
3. Once enough context is gathered, call `brief_create_type_guide` to generate a domain-specific guide
4. The domain-specific guide replaces this generic guide for future sessions

The generic guide is self-replacing: it exists only to bootstrap the first conversation. Once a domain-specific type guide is created, that guide takes precedence for the project's type.

Mode: adaptive — the server returns `is_generic: true` and `mode: adaptive` when serving this guide.
