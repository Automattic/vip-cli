# Recover an interrupted stable npm release

Use this when the stable publishing workflow created a GitHub release and tag,
but failed before publishing that version to npm.

1. Ensure the recovery workflow is merged into `trunk`.
2. Open **Actions → Publish to npm (if applicable) → Run workflow**.
3. Select branch **trunk**, set **release_mode** to **recover-stable**, and enter
   the existing tag in **release_version** (for example, `4.1.2`).
4. Leave **npm_tag** unchanged; stable recovery always publishes to `latest`.
5. Select **Run workflow** and inspect the **Recover stable release** job.

Do not rerun the original failed run to pick up workflow changes: reruns retain
the original workflow. The original action also tries to recreate the existing
GitHub release before it reaches npm publishing.

Recovery builds and tests the existing tag, preserves the GitHub release, and
uses the same workflow identity and `npm-publish` environment for npm trusted
publishing. It enables npm error logging and refuses versions already published
or older than the current `latest`. Successful publication starts the changelog
and command-reference documentation jobs.

Recovery does not create the next development-version PR that the regular
publishing action normally opens after publication. Handle that version bump
separately once recovery succeeds. If npm publication succeeds but a downstream
documentation job fails, rerun only the failed jobs.
