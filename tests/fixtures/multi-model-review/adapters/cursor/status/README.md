# Cursor `status` captures

Free checks (no prompt sent) made with Cursor Agent CLI `2026.10.01-e373342` on 2026-10-05, from a fresh scratch directory, while logged in. They pin the shape `cursor-review.sh --auth-check` matches (U13). Neither command created anything under `~/.cursor`.

| File | Command | Exit |
|------|---------|------|
| `logged-in.json` | `cursor-agent status --format json` | 0 |
| `logged-in.txt` | `cursor-agent status` | 0 |

**Sanitization:** the email is `<email>`; `userInfo.userId`, `firstName`, `lastName` and `createdAt` are replaced with placeholders. Keys, types and order are as captured.
