# Product Gap Audit

## P0 - Critical / Broken Workflows
1. **Missing Universal Navigation:** `Header.jsx` exists but is not used in `App.jsx`. Users cannot navigate across the site natively (they get stuck on pages).
2. **Auth State Desync in UI:** `Header.jsx` doesn't reactively reflect logged-in state (shows Login/Register even when logged in).
3. **Missing Resume Management (Delete/Update):** The dashboard likely lacks the ability to delete old resumes.

## P1 - Required for Production
1. **Modern Layout:** The application needs a cohesive visual language (sidebar or top-nav) for Dashboard, Results, and Analyze pages.
2. **Dashboard Data Integration:** Ensure `DashboardPage` fetches and displays real user resumes (and scores).
3. **Resume Optimizer Completeness:** Ensure the Optimizer actually allows saving/updating bullet points.
4. **Global Loading/Error States:** Need proper skeletons instead of blank screens while AI is processing.

## P2 - Important UX/Product Gaps
1. **Results Page Clutter:** The Results page contains 7 tabs but they need a cohesive layout (e.g. sidebar navigation).
2. **Empty States:** Dashboard needs a clear CTA if no resumes exist.
3. **Visual Consistency:** Tailwind styles need to be standardized (e.g., standard button classes).

## P3 - Nice-to-have
1. **Dark Mode:** (Deferred)
2. **Animations:** Framer motion refinements.
