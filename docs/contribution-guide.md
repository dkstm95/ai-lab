# Contribution Guide

This guide follows the contribution habits visible in Spring Framework: small logical commits, clear context in pull requests, and verification before review.

## Commit Rules

- Make each commit one logical change.
- Squash fixups that only correct the same logical change.
- Use an imperative subject under 55 characters when practical.
- Keep body lines under 72 characters when a body is useful.
- Explain why the change exists when the subject is not enough.
- Reference issues or follow-up work in the body, not by overloading the subject.
- Do not commit generated output from `dist`, `coverage`, or `node_modules`.

Good subjects:

```text
Add fake provider routing
Reject invalid idea titles
Document contribution workflow
```

Use a body when reviewers need motivation, tradeoffs, or validation:

```text
Document contribution workflow

Align local commit and PR expectations with Spring Framework's
published contribution guide and recent repository history.

Validation: pnpm check
```

## Pull Request Rules

- State the purpose in one or two sentences.
- List user-visible or architecture-level changes.
- Include validation commands and their result.
- Mention documentation updates or say none were needed.
- Keep unrelated cleanup out of the PR.
- Push review fixes to the same branch.

## Review Rules

- Review correctness, maintainability, tests, and documentation first.
- Prefer discrete actionable comments over broad style feedback.
- Ask for missing tests when behavior changes.
- Ask for documentation updates when commands, structure, or workflows change.

## References

- Spring Framework contributing guide: https://github.com/spring-projects/spring-framework/blob/main/CONTRIBUTING.md
- Spring Framework recent commits: https://github.com/spring-projects/spring-framework/commits/main/
- Spring Framework merged PRs: https://github.com/spring-projects/spring-framework/pulls?q=is%3Apr+is%3Amerged+sort%3Aupdated-desc
- Pro Git commit guidelines: https://git-scm.com/book/en/Distributed-Git-Contributing-to-a-Project#Commit-Guidelines
