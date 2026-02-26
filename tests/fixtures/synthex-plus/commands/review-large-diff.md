Review the following changeset. This is a security-sensitive change to the authentication system.

## Changed Files (742 lines changed)

- src/middleware/auth.ts (new, 120 lines) — JWT validation middleware
- src/lib/session.ts (modified, 85 lines) — Added refresh token rotation
- src/pages/api/auth/login.ts (new, 95 lines) — Login API endpoint
- src/pages/api/auth/refresh.ts (new, 62 lines) — Token refresh endpoint
- src/pages/login.tsx (new, 145 lines) — Login page component
- src/components/AuthProvider.tsx (new, 78 lines) — React auth context
- tests/auth.test.ts (new, 157 lines) — Auth flow tests

## Diff Summary

The changeset implements JWT-based authentication with:
- Email/password login with bcrypt password hashing
- Access tokens (15min) + refresh tokens (7 days) in httpOnly cookies
- Middleware that validates JWT on protected routes
- React context for client-side auth state

## Project Context

CLAUDE.md: TypeScript strict mode, Vitest, 80% coverage. Security-sensitive project handling user PII.
