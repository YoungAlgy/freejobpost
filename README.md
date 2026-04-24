# freejobpost.co

Free healthcare job board — employer side of a two-sided marketplace with [freeresumepost.co](https://freeresumepost.co).

## Stack
- Next.js 16 (app router) + React 19
- Tailwind CSS v4 (@tailwindcss/postcss)
- Supabase (shared project: `tsruqbodyrmxqzhvxret`) for DB + auth + storage
- Deployed on Vercel

## Dev
```bash
npm install
cp .env.example .env.local  # fill in Supabase anon key
npm run dev                  # http://localhost:3000
```

## Structure
- `/` — landing
- `/post-job` — employer post flow (email-verified)
- `/jobs` — public listing
- `/jobs/[slug]` — single job
- `/employer/dashboard` — authed employer area

## Related
- [freeresumepost.co](https://github.com/YoungAlgy/freeresumepost) — candidate side
- [avahealth-crm](https://github.com/YoungAlgy/avahealth) — admin/back-office (Ava team)
- Plan doc: `~/.claude/plans/compiled-frolicking-moler.md`
