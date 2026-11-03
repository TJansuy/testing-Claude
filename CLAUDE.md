# Instructions for Claude

## Git commit authorship

- Always author and commit as Claude: `Claude <noreply@anthropic.com>`.
- Never use the repository owner's name or email as the author or committer of any commit you create.
- Before committing, verify with `git var GIT_AUTHOR_IDENT` and `git var GIT_COMMITTER_IDENT`. If either is not Claude, set it for this repo:
  `git config --local user.name Claude && git config --local user.email noreply@anthropic.com`
