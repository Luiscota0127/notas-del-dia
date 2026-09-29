# Notas del Día

A progressive web app that replaces Notion for shared daily to-dos.

The core idea: **free text is the source of truth.** The database stores `notes.body` as a `text` column and nothing else. There is no tasks table, no `title`/`time`/`done` columns, no required fields. Tasks are *derived* by a parser that runs in the browser on every render.

## Why not a normal to-do app

Most to-do apps solve the wrong problem. They ask you to fill in a form, and then you spend your day fighting the form instead of writing.

The problem isn't that you need structure — it's that Notion puts a structured layer on top of text people write by hand. So the parser here is deliberately small: a ~200-line function over a `contenteditable` div. That keeps the format contract under your control.

Heavy WYSIWYG editors (TipTap, ProseMirror, Slate, Lexical) are explicitly ruled out. A new database column is only justified if a test first proves the parser can't produce the same result.

## Stack

TypeScript · Next.js 16 · React 19 · Supabase (SSR auth + realtime) · Tailwind CSS 4 · Vitest

## Features

- Free-text daily notes, synced between two devices
- Task lines parsed and rendered client-side
- Reminders
- Progressive web app — installable, works offline
- Test-covered parser as the format contract

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run lint
npm test           # vitest run
npm run test:watch
```

Supabase credentials go in `.env` — see `.env.example`. Never commit real keys.

## Visual direction

The look is locked by design, not preference:

- Background `#111111`, text `#E4E4E7`, month accent `#F59E0B`
- System sans-serif, 16–17px, `line-height` 1.6
- **Square** checkboxes with a border, filled when checked — never rounded
- Dark mode by default

The point of the daily editor and the week view is to replicate the Notion reading experience. That requirement overrides general UI advice.

## Status

Active development. See `PLAN.md` for current direction.
