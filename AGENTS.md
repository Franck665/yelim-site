# AGENTS.md - Context for Yelim Site

## 0. Yelim Skill
* **Required Skill:** Use `$yelim-project-context` before searching, editing, building, or debugging any Yelim-related task.
* **Skill Path:** `/Users/burkinbila/.codex/skills/yelim-project-context/SKILL.md`
* **Current Project:** Yelim web site and article publishing/admin UI at `/Users/burkinbila/Desktop/yelim-site`.
* **Routing Rule:** If the request touches mobile apps, backend Functions, livreur, parrainage, VideoGen, or Firestore scripts, pick the correct project root from the skill before running commands.

## 1. Project Overview
Yelim Site contains the institutional/legal website, web install pages, catalogue pages, and the admin article publishing interface.

## 2. Coding Standards
* Keep changes scoped to the relevant page or admin module.
* Preserve Firebase Hosting configuration unless deployment is explicitly requested.
* Keep article publishing fields aligned with the mobile models and backend contracts.
