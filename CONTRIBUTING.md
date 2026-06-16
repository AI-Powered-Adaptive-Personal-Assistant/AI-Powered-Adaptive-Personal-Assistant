# Contributing & Team Workflow

To avoid the merge conflicts we kept hitting from everyone editing `main` in
parallel, all changes go through **feature branches + Pull Requests**.

## The flow

1. **Never commit directly to `main`.** Branch off the latest `main`:
   ```bash
   git checkout main && git pull
   git checkout -b feature/<short-name>
   ```
2. Make your change, then push the branch and open a PR into `main`.
3. CI (`.github/workflows/ci.yml`) runs `npm run lint` + `npm run build` on the
   PR. Both must pass (green) before merging.
4. Get one review, then **Squash and merge**. Delete the branch after.
5. Pull `main` often so your branch stays close to it (fewer conflicts):
   ```bash
   git fetch origin main && git rebase origin/main
   ```

## Resolving a conflict

```bash
git fetch origin main
git rebase origin/main        # replay your commits on top of latest main
# fix files that show <<<<<<< ======= >>>>>>>, then:
git add <files> && git rebase --continue
npm run lint && npm run build # confirm it still builds
git push --force-with-lease
```

## Recommended branch protection (repo admin → Settings → Branches → add rule for `main`)

- ✅ Require a pull request before merging
- ✅ Require status checks to pass → select **CI / build**
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above

## Local checks before pushing

```bash
npm run lint    # tsc --noEmit
npm run build   # vite build + server bundle
```

## Deployment (Vercel)

`main` auto-deploys to Vercel as a **static** site (config in `vercel.json`:
`vite build` → `dist`). The Express backend in `server.ts` is for local/Node
hosting only; on Vercel the app calls Gemini directly in the browser, so set
`VITE_GEMINI_API_KEY` in the Vercel project's Environment Variables.
