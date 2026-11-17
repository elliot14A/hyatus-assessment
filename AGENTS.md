# Guest Desk Agent Instructions

@[Guest Desk Project Instructions](/home/kiwi/Desktop/Obsidian/guest-desk/agents.md)

---

## Repository Operational Instructions

### Verification Commands
Before concluding any task or requesting review:
```bash
npm test
```
All commands must exit with code 0.

### Codebase Searches with Graphify
- Use `graphify query "<question>"` for architecture lookups.
- After modifying code files, update the knowledge graph with `graphify update .`.
