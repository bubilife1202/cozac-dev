# [cozac.dev](https://cozac.dev)

jinbae park's personal site, built as a macos desktop you can actually use. every app is a real app: the notes are the writing, the messages app is how you ask me things, the finder browses my repos.

## features

### desktop environment

a macos-themed desktop with:
- **window management**: draggable, resizable windows with minimize, maximize, and close
- **dock**: magnifying icon row with launch bounce and hover tooltips
- **menu bar**: apple menu, file menu, app menu, and status menus (wifi, bluetooth, control center)
- **spotlight**: ⌘space searches apps and public notes with keyboard navigation
- **system states**: lock screen, sleep mode, restart, and shutdown overlays

### apps

**messages** - imessage clone, and the main way to ask about my work
- the `cozac` conversation answers questions about my experience and projects
- answers stream in from google's hosted `gemma-4-26b-a4b-it`, grounded in a
  verified portfolio knowledge base — no browser model download, no wait
- questions the portfolio cannot support are declined instead of guessed at,
  and the sources behind each answer link to the note they came from
- other ai contacts have their own personalities (via braintrust)
- reactions, sound effects, typing indicators, group chats, @mentions
- command menu (⌘K), pinned conversations, swipe gestures
- focus mode integration (mutes notifications)

**notes** - apple notes clone holding the site's written content
- public notes viewable by everyone, private notes per browser session
- github flavored markdown with interactive task lists
- image paste/upload support
- swipe gestures on mobile

**lobby** - a private message box, not a public feed
- pick a topic, start as a guest, send a note only i can read
- no message list, no public timeline: the database revokes read access from
  every client role

**finder** - file browser
- sidebar navigation (recents, applications, desktop, documents, downloads, projects)
- browse local files and github repositories
- quick look panel for images, pdfs, and text
- launch apps from applications folder

**music** - apple music clone
- library, playlists, and charts
- playback through the youtube iframe player

**iterm** - terminal emulator
- real file system navigation
- github integration (browse your repos)
- basic shell commands (ls, cd, cat, pwd, clear, etc.)

**calendar** - apple calendar clone
- day, week, month, and year views with smooth navigation
- create, edit, and delete your own events
- drag-to-create events in day/week views
- holidays automatically displayed
- data persisted in localstorage

**photos** - apple photos clone
- photo library with grid view and full-screen viewer
- collections: flowers, food, friends
- favorites (per-browser, stored in localstorage)
- time filters (today, this week, this month, this year, all)
- keyboard navigation (arrow keys, escape to close)
- upload via ios shortcut with ai auto-categorization

**settings** - system preferences
- wi-fi and bluetooth panels
- appearance (light/dark/system theme)
- airdrop and focus mode toggles
- about this mac

**eggbrawl / eggcastle** - my games, opened in a new tab from the dock

### mobile

an ios-style home screen rather than a shrunken desktop:
- spring-animated app open/close with a rubber-band dismiss gesture
- touch-optimized controls
- full app functionality

## how it works

### architecture

next.js app router with a route group for the desktop environment. on desktop
screens, all apps render in windows on a shared desktop. on mobile, apps
display fullscreen over an ios home screen.

**portfolio chat** (`/api/portfolio-chat`) is the only server-side ai path that
matters for visitors:
- `lib/local-ai/portfolio-knowledge.ts` holds the verified facts and retrieves
  the entries relevant to a question
- the retrieved evidence goes into the system prompt; the model is told not to
  infer anything outside it
- a question with no supporting evidence is declined before any provider call,
  so unanswerable questions cost nothing
- the response streams as newline-delimited json so the typing indicator
  reflects real generation
- requests are length-limited, time-limited, and rate-limited per visitor in a
  window shared by every server instance (`lib/rate-limit.ts`)

**notes** use a session-based architecture:
- **public notes**: managed by the site owner, visible to everyone
- **private notes**: each browser session gets a unique id (stored in
  localstorage) linking to notes you create

**messages** are otherwise client-side only:
- conversations stored in localstorage
- other ai contacts respond via the braintrust proxy (openai-compatible)
- no server-side message storage

**lobby** is write-only by design. `supabase/migrations/20260724000000_private_lobby.sql`
revokes select on `messages` and `profiles` from `anon` and `authenticated`,
leaves insert for signed-in guests, and drops both tables from the realtime
publication. only the service role can read what visitors send.

**photos** use supabase storage:
- images stored in supabase storage bucket
- metadata (filename, timestamp, collections) in database
- favorites are per-browser (stored in localstorage)
- upload via api with ai auto-categorization (openai gpt-4o-mini)

the app is built with:
- **next.js** with app router
- **typescript** for type safety
- **supabase** for notes, photos, lobby, and rate limiting
- **google gemma 4** for the portfolio conversation
- **braintrust** for the other ai chat responses (openai-compatible proxy)
- **react-markdown** with github flavored markdown
- **tailwind css** for styling

### backend

the app uses [supabase](https://supabase.com) for the postgresql database with
row-level security policies to control access.

**database schema**:

the `notes` table stores all notes with these fields:
- `id` (uuid): unique identifier
- `title` (text): note title
- `content` (text): markdown content
- `session_id` (uuid): links notes to browser sessions
- `public` (boolean): controls visibility
- `slug` (text): url-friendly identifier
- `category` (text): optional categorization
- `emoji` (text): note icon
- `created_at` (timestamp): when the note was created

### caching

public notes are cached for 24 hours using next.js isr. private notes are
always real-time.

**to manually revalidate public notes**:

set `REVALIDATE_TOKEN` in environment variables, then:

```bash
# revalidate sidebar (when adding/removing public notes)
curl -X POST "https://cozac.dev/notes/revalidate" \
  -H "Content-Type: application/json" \
  -H "x-revalidate-token: your-token" \
  -d '{"layout": true}'

# revalidate specific note (when updating content)
curl -X POST "https://cozac.dev/notes/revalidate" \
  -H "Content-Type: application/json" \
  -H "x-revalidate-token: your-token" \
  -d '{"slug": "note-slug"}'
```

or redeploy on vercel to refresh all pages.

### ios shortcut for photos

upload photos directly from your iphone using the share sheet:

1. open the **shortcuts** app on ios
2. create a new shortcut with these actions:
   - **receive** images from share sheet
   - **get details of image** → date taken
   - **resize image** to max 2048px (fit)
   - **convert image** to jpeg (quality 0.8)
   - **encode** with base64
   - **format date** → iso 8601
   - **get contents of url**:
     - url: `https://cozac.dev/api/photos/upload`
     - method: POST
     - headers: `x-api-key: <your-PHOTOS_UPLOAD_API_KEY>`
     - body: json `{ "image": [base64], "timestamp": [formatted date] }`
3. name it "add to website"
4. enable "show in share sheet" for images

when you share a photo, the shortcut uploads it to supabase storage and ai
automatically categorizes it into collections (flowers, food, friends).

## running it yourself

### clone the repo

`git clone https://github.com/bubilife1202/cozac-dev`

### set up the database

this project uses [supabase](https://supabase.com) as a backend:

1. create a [new project](https://database.new) and enter your project details
2. wait for the database to launch
3. run the migrations:

```bash
supabase db push
```

migrations are append-only. an applied migration is never edited in place —
correcting one means adding a new migration that moves the schema forward.

grab the project url and anon key from the api settings and put them in a new
`.env.local` file in the root directory:

```
# supabase (required for notes, photos, lobby, rate limiting)
NEXT_PUBLIC_SUPABASE_URL="<your-supabase-url>"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<your-anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<your-service-role-key>"

# google ai studio (required for the cozac portfolio conversation)
GEMINI_API_KEY="<your-gemini-api-key>"

# braintrust (required for the other messages ai contacts)
BRAINTRUST_API_KEY="<your-braintrust-api-key>"

# photos upload (required for ios shortcut)
PHOTOS_UPLOAD_API_KEY="<generate-random-key>"
OPENAI_API_KEY="<your-openai-api-key>"

# site config (optional)
NEXT_PUBLIC_SITE_URL="https://yourdomain.com"
REVALIDATE_TOKEN="<your-revalidate-token>"
NEXT_PUBLIC_REVALIDATE_TOKEN="<your-revalidate-token>"

# github (optional - helps avoid rate limits for iterm/finder)
GITHUB_TOKEN="<your-github-token>"
```

**notes:**
- `GEMINI_API_KEY` must never carry a `NEXT_PUBLIC_` prefix — it is read only
  on the server and sent to google in the `x-goog-api-key` header
- `SUPABASE_SERVICE_ROLE_KEY` is needed for photo uploads and the shared rate
  limit counter (both bypass RLS)
- `OPENAI_API_KEY` is used for ai photo categorization
- `GITHUB_TOKEN` is optional but helps avoid rate limits in the iterm/finder
  github integration

### install dependencies

`npm install`

### run the app

`npm run dev` — available at http://localhost:3000.

### checks

```bash
npm run check   # lint + typecheck + build
npm test        # portfolio chat and storage unit tests
npm run verify:local-ai   # asserts no visitor-side model download crept back in
```

### deploy

deploy using [vercel](https://vercel.com)

## markdown syntax for notes

notes support github flavored markdown (gfm) with interactive features. here's what you can use:

### headings

```markdown
# heading 1
## heading 2
### heading 3
```

### text formatting

```markdown
**bold text**
*italic text*
~~strikethrough~~
`inline code`
```

### lists

**unordered lists**:
```markdown
- item one
- item two
  - nested item
  - another nested item
```

**ordered lists**:
```markdown
1. first item
2. second item
3. third item
```

### task lists (interactive)

task lists are interactive - click checkboxes to toggle completion:

```markdown
- [ ] task to do
- [x] completed task
- [ ] another task
```

the app automatically updates the markdown when you click checkboxes, so your progress is saved.

### tables

create tables using standard markdown table syntax. tables render with a styled dark theme:

```markdown
| book | author | year read |
|------|--------|-----------|
| the great gatsby | f. scott fitzgerald | 2023 |
| 1984 | george orwell | 2024 |
```

this renders as:

| book | author | year read |
|------|--------|-----------|
| the great gatsby | f. scott fitzgerald | 2023 |
| 1984 | george orwell | 2024 |

**table features**:
- white borders on dark background
- properly padded cells
- header row styling
- responsive layout
- supports links in cells

### links

```markdown
[link text](https://example.com)
```

all links automatically open in new tabs for better navigation.

### code blocks

**inline code**: use backticks for `inline code`

**code blocks**: use triple backticks for multi-line code
````markdown
```javascript
function hello() {
  console.log("hello world");
}
```
````

### blockquotes

```markdown
> this is a blockquote
> it can span multiple lines
```

### images

paste images directly into notes by copying any image (screenshot, file, etc.) and pressing `ctrl+v` (or `cmd+v` on mac). images are automatically uploaded to supabase storage and inserted as markdown.

you can also manually add images:
```markdown
![alt text](image-url.jpg)
```

**supported formats**: jpeg, png, gif, webp (including animated gifs)
**file size limit**: 5mb
**images are automatically resized** to fit the note width while maintaining aspect ratio

### horizontal rules

```markdown
---
```

## license

licensed under the [mit license](LICENSE.md).

forked from [alanagoyal/alanagoyal](https://github.com/alanagoyal/alanagoyal), whose macos desktop shell this is built on.
