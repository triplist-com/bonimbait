# Brief: `bonimos` (P7, Should). Dev port 3123. Migration slot `20261014126000`–`20261014126959`. API cap $0.10

You own **Bonim.Os · מערכת הליווי ללקוחות הניהול**: the managed-client mode of the Builder Hub.
- The owner's turnkey management plan already promises "חיבור למערכת Bonim.Os לשליטה מלאה".
- Today that deliverable is an Excel file.
- You make it real, in his brand, on top of the hub the client already used for free. The upgrade from free hub to managed client is seamless.

Read first:
- `docs/platform/PROGRAM.md`: the §3.1 P7 row and the rules.
- `docs/platform/DESIGN_SYSTEM.md`
- `docs/platform/FOUNDATION.md`
- The `hub` squad's code and docs: `lib/hub/*`, `app/my-home/*`, and their migrations. Specifically:
  - `hub_projects`
  - `hub_project_members` (role `owner | manager`)
  - `hub_budget_items` (with versions)
  - `hub_documents` and the `hub-docs` bucket
  - `hub_tasks`

## Build
1. **Manager role, enforced by RLS.** A staff member, or a `manager` assigned through `hub_project_members`, sees and edits **only** their assigned projects.
   - Admin assigns managers to projects (admin page + nav entry).
   - Clients see their manager on their hub.
2. **Manager workspace at `/manage/`:**
   - a list of assigned projects, showing stage, budget health (variance), the next milestone and open approvals;
   - a calm, professional, laptop-first layout that also works on a phone.
3. **Managed project view.** Shared by manager and client, with role-appropriate actions. Sections:
   - **Budget vs actual.** Versions ("תקציב מאושר v1 → v2"), variance by the 7 stages and by category, and a change log of who changed what and why.
   - **Milestones.** A Gantt-lite timeline by stage, with planned vs actual dates.
   - **Payment approvals.** Contractor payment requests (amount, milestone, attachment) → the manager reviews → the client approves. Keep a full audit log. This is a log and workflow, **not** real money movement.
   - **Documents.** Plans, permits, contracts and quotes, in the private bucket.
   - **Site-photo feed.** Uploads grouped by date and stage, with captions. Use Storage, with client-side resizing.
   - **Activity log and notes.**
4. **Demo view `/platform/demo/bonimos/`.** A realistic managed project in the owner's brand:
   - 180 m² in the Shfela;
   - at the shell stage;
   - budget vs actual at +2.1%;
   - the next milestone;
   - a pending payment approval;
   - a few site photos. Use tasteful placeholder construction imagery that you're allowed to use: the owner's own media in local Storage, or generated SVG illustrations. **No stock photos you can't license.**

   Use foundation fixtures, register the view as `'ready'`, and add the pitch line: "שורה 3.3 במחירון שלכם. עכשיו היא אמיתית."
5. **Analytics:** `bonimos_*` events, added to the catalog: approval requested/approved, photo uploaded, budget version created.

## Quality bar
- RLS tests on the local stack, for each of these roles: anonymous, client A, client B, manager of A, a manager not assigned to A, and staff.
- Unit tests for budget-version diffs and the approval state machine.
- Run every charter gate.
- Screenshots on desktop and mobile:
  - the manager list;
  - the project view (each section);
  - the client's view;
  - the demo view.
