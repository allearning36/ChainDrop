---
name: Railway watch paths
description: Railway only rebuilds on changes to specific watched paths
---

## Behavior
Railway's GitHub integration watches specific file paths. Changes to `lib/` packages are SKIPPED ("No changes to watched files") even if they affect the API server build.

**Why:** Railway is configured to watch only `artifacts/api-server/` (or similar). Changes to `lib/db/`, `lib/api-spec/` etc. don't trigger a new build automatically.

**How to apply:** When fixing bugs in lib packages, also touch a file in `artifacts/api-server/src/` (e.g. re-push index.ts with same content) OR have the user manually trigger "Redeploy" from Railway dashboard's 3-dot menu on the crashed deployment.

Note: Re-pushing the same file content to GitHub may also be skipped by Railway (content hash unchanged). Make a real content change (add a comment) to guarantee a rebuild.
