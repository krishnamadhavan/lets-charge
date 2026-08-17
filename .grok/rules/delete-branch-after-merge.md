# Delete source branch after merge

After a PR is merged, **always delete the source branch on `origin` and on the local machine**.

## Required cleanup

1. Confirm the PR is merged and local `main` is up to date (`git checkout main && git pull`).
2. Delete the remote branch: `git push origin --delete <branch>` (or `gh pr merge --delete-branch`).
3. Delete the local branch: `git branch -d <branch>`. Use `-D` only if `-d` refuses after a squash-merge.
4. Prune stale remotes: `git fetch --prune`.

## Do not

- Leave merged feature branches on `origin` or locally
- Delete `main`
- Delete a branch that is not merged (unless the user explicitly abandons the PR)

When merging a PR yourself, pass `--delete-branch` and remove the local branch in the same turn.
