# MANDATORY AGENT GUARDRAILS
- No git commands that change history.
- Don't read, print, or modify real values in `backend/.env`. Only edit `.env.example` files.
- Never drop, delete, or overwrite existing database data. Tests may only create and delete records whose username or title starts with `test_`.
- STOP AND ASK: Don't change Mongoose models or add collections without listing the change under 'Needs my decision' first and waiting for explicit approval.
- Don't add services that need keys. If something needs a key, skip it and log it.
- Log every new dependency with a reason. Prefer no new dependency.
- Never weaken an existing test to make it pass.
- When unsure, take the safest simple option, note it in `WORKLOG.md`, and continue.

# DEFINITION OF DONE (EVERY WAVE)
1. Finish by appending to `WORKLOG.md`: what changed, files touched, test results, what you skipped, and open decisions.
2. All tests pass (`npm run test:smoke` and integration tests), and no existing test was weakened.
3. Check `git status` and `git diff --stat` to ensure no surprise files or `.env` files are tracked.
4. DO NOT commit automatically; stop and present the diff summary for human/Claude review.