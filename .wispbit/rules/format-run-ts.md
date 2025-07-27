---
include: packages/ci/src/run.ts
---

Ensure that the documentation for meow commands in `run.ts` is clearly formatted and easy to read.

Bad:

ts```
Options for github CI provider (by default, will auto-detect if it's in github actions):
--github-token <token> Set a custom GitHub token for the CI mode (env: GITHUB_TOKEN)
--github-repository <repo> Set a custom GitHub repository for the CI mode. Should be in format <owner>/<repo> (env: GITHUB_REPOSITORY)
--github-pull-request-number <number> Set a custom GitHub pull request number for the CI mode (env: GITHUB_PULL_REQUEST_NUMBER)
--github-commit-sha <sha> Set a custom GitHub commit SHA for the CI mode (env: GITHUB_SHA)

````

Good:

ts```
Options for GitHub CI provider (auto-detects if running in GitHub Actions):
   --github-token <token>                Set a custom GitHub token for CI mode (env: GITHUB_TOKEN)
   --github-repository <owner>/<repo>    Set a custom GitHub repository for CI mode (env: GITHUB_REPOSITORY)
                                         Format: <owner>/<repo>
   --github-pull-request-number <number> Set a custom GitHub pull request number for CI mode (env: GITHUB_PULL_REQUEST_NUMBER)
   --github-commit-sha <sha>             Set a custom GitHub commit SHA for CI mode (env: GITHUB_SHA)
````
