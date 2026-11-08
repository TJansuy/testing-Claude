# Instructions for Claude

## Git commit authorship

- Always author and commit as Claude: `Claude <noreply@anthropic.com>`.
- Never use the repository owner's name or email as the author or committer of any commit you create.
- Before committing, verify with `git var GIT_AUTHOR_IDENT` and `git var GIT_COMMITTER_IDENT`. If either is not Claude, set it for this repo:
  `git config --local user.name Claude && git config --local user.email noreply@anthropic.com`

## Branches

- Create a new branch for each feature or major change, starting from the latest `main` (`git fetch origin main && git checkout -b claude/<short-feature-name> origin/main`).
- Don't reuse an earlier feature's branch for new work, even if it hasn't been merged yet.
- Small follow-up fixes to a feature that's still in progress go on that feature's branch.

## Pull requests

- When a feature or major change is complete (checked, built, tested and pushed), open a pull request for its branch without being asked. Base it on `main`.
- When later work belongs to a feature whose pull request is still open, push it to that branch and update the pull request's title and description so they still match what it contains.
- Never monitor, watch or subscribe to pull requests on this repo (no `subscribe_pr_activity`, no polling).
- Don't offer to monitor them either.
- Apart from opening and updating your own pull requests as above, only act on a pull request (reviews, comments, merging, closing) when the user explicitly asks.

## Code

- The PWAs and the relay server are TypeScript. Edit `src/`, never the built JavaScript (`PWA/*/app.js`, `PWA/*/sw.js`, `PWA/LocalChatter/dist/`).
- After changing app code, run `npm run check` and `npm run build` from the repository root and commit the rebuilt output (GitHub Pages serves it as-is). The relay builds itself (`npm run build` in `PWA/LocalChatter/server`, or Docker).
- Keep hand-written source files to 300 lines or fewer; split larger ones into modules. Generated files, lockfiles and `vendor/` are exempt.
