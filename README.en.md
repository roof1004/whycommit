# whycommit

[한국어](README.md) | **English**

Not a tool where the AI explains. A tool where the AI **asks**.

At commit and pull request time, an agent asks you interview-style questions such as "Why did you do it this way?", so that you understand the code you just shipped.

## Why

When you vibe-code, it is easy to take what the AI wrote and move on. If you never ask "why this way?" or "was there another option?", the code works but it never becomes yours.

whycommit puts those questions at the natural pause points of your workflow: commits and pull requests. The agent asks first instead of handing you the answer. It explains only the parts you could not answer, and asks about them again later.

- Commit title suggestions are a side feature. The core is the **quiz and the review**.
- There are no scores or grades, and "I don't know" is a fine answer. The agent asks like a senior helping you with a mock interview.
- The grading is strict, though. A vague answer that misses the key reason is not counted as correct.

## What it does

| Skill | When | What it does |
|---|---|---|
| `commit` | Often, lightly | Reads the staged changes and shows three commit title candidates. Commits with the one you pick, after you confirm. |
| `quiz` | When a unit of work is done | Picks the design decisions from the changes since the last quiz and asks 2–5 questions. Saves the results in your learning notes, then drafts a record for the PR body or the commit body. |
| `review` | Whenever you like | Asks again, from a new angle, about topics you did not understand. Moves a topic to "understood" when you get it right. |

There are only three kinds of questions:

- **Why did you do it this way?** The reason for this choice
- **Was there another way?** Alternatives and their trade-offs
- **What happens without it?** How it works

It does not ask questions you can answer by reading the diff ("What did you change?"), or computer science trivia unrelated to your change.

## Examples

These show how a session goes. The agent answers in the language you use.

### commit

```text
> /whycommit:commit

2 staged files: src/auth/session.js, src/auth/session.test.js
Recent commits use the "feat: ..." format, in English.

Commit title candidates
1. feat: refresh the token only on a 401 response
2. feat: refresh the token automatically when the session expires
3. refactor: move token refresh logic into the session module
4. Write my own
5. Generate again

> 1

I'll commit with this title. The body stays empty.
  feat: refresh the token only on a 401 response
Go ahead?

> yes

Committed. 3 commits have not been quizzed yet.
```

### quiz

```text
> /whycommit:quiz

You are on feat/token-refresh, and the default branch is main.
1. PR mode (recommended)
2. Finish mode

> 1

I'll look at the 3 commits since you branched from main. 3 questions.

[1/3] src/auth/session.js, lines 42–58
You refresh the token only when a request gets a 401, not before every request.
Why did you do it this way?

> Refreshing every time would send too many requests to the server.

Right direction. One more question on this.
If 5 requests get a 401 at the same time, how many refresh requests go out?

> Hmm... I don't know.

That's fine, let's look at it together.
With the current code, 5 go out, because each request calls refreshToken() on its own.
(The explanation goes on with the answer, the reason, and alternatives with trade-offs.)

...

Here is the draft of today's work and the remaining work. Tell me what to change.
```

### review

```text
> /whycommit:review

You have 4 topics to review in this project. Starting with the ones you missed most often or saw longest ago.

[1/4] Concurrent 401 responses and duplicate token refreshes
Last time I asked "how many go out". This time I'll ask differently.
What happens if you delete the refreshPromise variable in src/auth/session.js?

...

2 resolved, 2 left
```

## Requirements

- **git**
- **Claude Code**, to install it as a plugin. For other agents, see [Supported agents](#supported-agents).
- **Node.js 18 or newer**, to run the scripts that handle the notes and state. No external packages are installed. Check with `node --version`. If Node.js is missing, the skill tells you how to install it and stops.
- **GitHub CLI (`gh`), signed in**: only for PR mode. Without it you can use finish mode, or have the PR body drafted for you to paste.
  - Install: `winget install --id GitHub.cli` (Windows), `brew install gh` (macOS)
  - Sign in: `gh auth login`

## Install

### As a Claude Code plugin (recommended)

From a terminal:

```sh
claude plugin marketplace add roof1004/whycommit
claude plugin install whycommit@whycommit
```

Or inside Claude Code:

```text
/plugin marketplace add roof1004/whycommit
/plugin install whycommit@whycommit
```

With Claude Code v2.1.292 or newer, one line also works:

```sh
claude plugin install whycommit --marketplace roof1004/whycommit
```

After installing, restart Claude Code or run `/reload-plugins`. Then call `/whycommit:commit`, `/whycommit:quiz` and `/whycommit:review`. By default the plugin is enabled in every project. To enable it in one project only, run both commands in that project's folder with `--scope project`.

### Without the plugin (as Agent Skills standard skills)

Use this if you don't use plugins, or if you use another agent.

```sh
git clone https://github.com/roof1004/whycommit.git
node whycommit/tools/install-skills.mjs --dest ~/.claude/skills   # Claude Code
node whycommit/tools/install-skills.mjs --dest ~/.agents/skills   # agents that read .agents/skills
```

- The skills are installed as `whycommit-commit`, `whycommit-quiz` and `whycommit-review`. Short names like `commit` and `review` easily clash with other skills or built-in commands. For example, `/review` is already a built-in command in Claude Code.
- If a different skill with the same name already exists, nothing is installed. Use `--prefix my-` for another prefix, or `--force` to replace it anyway.
- `--dry-run` only shows where the skills would go.
- To update, run `git pull` and the same command again.

### Update

Auto-update is off by default for marketplaces you add yourself. When a new version comes out:

```sh
claude plugin marketplace update whycommit
claude plugin update whycommit@whycommit
```

You can also turn on auto-update in the Marketplaces screen of `/plugin`.

### Uninstall

```sh
claude plugin uninstall whycommit@whycommit
claude plugin marketplace remove whycommit
```

Your learning notes (`~/whycommit`) are not deleted. Delete that folder yourself if you no longer need it.

### Troubleshooting

- **I installed `gh` or `node` but the command is not found.** Terminals and editors that were open before the install keep using the old PATH. Close all windows of your editor (for example VS Code) and start it again. Opening a new terminal tab inside the editor is not enough.
- **`marketplace add` fails with an SSH error.** If you have no GitHub SSH key, set the environment variable `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` and run it again.
- **I'm asked for permission every time a script runs.** whycommit handles its records with `node .../wc.mjs` commands. In the permission prompt you can choose to keep allowing this command.

## Usage

| Command | What it does |
|---|---|
| `/whycommit:commit` | Pick a commit title from the candidates and commit. It never quizzes and never pushes. |
| `/whycommit:quiz` | Take a quiz on the changes since the last quiz. Suggests PR mode on a work branch and finish mode on the default branch. |
| `/whycommit:review` | Review topics you did not understand in the current project. Outside a repository it covers every project. |
| `/whycommit:review all` | Review topics from every project (`전체` also works). |

### The two quiz modes

- **PR mode**: after the quiz, suggests a PR title and body. If the PR already exists, it updates only the whycommit section and leaves the rest of the body alone.
- **Finish mode**: if the last commit is not pushed yet, records into that commit's message body. If it is already pushed, it leaves the commit alone and keeps the results only in your notes.

### Safety

- Commits, pushes, and creating or editing a PR always show a preview and wait for your confirmation.
- It never force-pushes, and never rewrites a commit that is already pushed.

## Where the notes are stored

In a `whycommit` folder in your home folder:

- macOS, Linux: `~/whycommit/`
- Windows: `C:\Users\<your user name>\whycommit\`

```text
whycommit/
├── config.json              settings
├── tmp/                     temporary files used during a run (deleted at the end)
└── projects/
    └── <owner>/<repo>/      one folder per project
        ├── notes.md         learning notes to read
        ├── notes.json       the notes' source data (managed by the scripts)
        └── state.json       last quizzed commit and similar state
```

- Everything lives outside your repositories, so it is **never pushed to GitHub and never staged.** If the data folder is inside a git repository, whycommit refuses to write. If your home folder itself is a git repository, set the `WHYCOMMIT_HOME` environment variable to a folder outside it.
- Read your notes in `notes.md`. It is regenerated on every write, so manual edits are overwritten. If you think a grade was wrong, dispute it during the quiz.
- Projects are identified by the remote repository name (`owner/repo`). Without a remote, the folder name is used.

## Settings

`~/whycommit/config.json` is created with defaults on the first run. Nothing is asked up front.

| Key | Default | Meaning |
|---|---|---|
| `quiz.minQuestions`, `quiz.maxQuestions` | 2, 5 | Range for the number of questions, chosen from the number of design decisions. |
| `quiz.followUpsPerQuestion` | 1 | How many follow-up questions to ask when an answer is right but shallow. |
| `body.includeLearning` | `false` | When on, the PR or commit body also lists the topics you understood and did not understand, one line each. |
| `review.count` | 5 | Topics per review session. |
| `language` | `"auto"` | Follows the language you use. Can be fixed, for example `"ko"` or `"en"`. It also decides the language of the record headings and the notes labels (Korean, or English for anything else). |
| `writingStyle` | `""` | Saved when you say "write it like this from now on" while editing a draft. |

If you edit the file by hand and a value is invalid, whycommit does not overwrite the file. It uses the default for that value and tells you.

## Tested environments

| Environment | Script tests (CI) | Skills run for real (Claude Code) |
|---|---|---|
| macOS (zsh, bash) | ✅ | Not yet |
| Windows PowerShell 5.1 | ✅ | ✅ |
| Windows Git Bash | ✅ | ✅ (same Windows machine) |
| Linux (Node 18, 24) | ✅ | Not yet |

- GitHub Actions runs the same script tests in each environment above. They cover paths with spaces and Korean characters, saving and reading Korean text, and line endings. They also call the scripts directly from each shell to check that paths are passed correctly.
- The skills were run end to end in Claude Code (v2.1.258) on Windows: commit, quiz (finish mode, disputes, stopping midway, skipping, writing items yourself, saving a writing style) and review (one project, all projects).
- PR mode was tested against a real GitHub repository: creating a PR in a repository with a PR template, updating only the whycommit section after more commits, and noticing a body edited on GitHub and asking before overwriting it.

## Limitations

- **Nothing stops you from asking another AI for the quiz answers.** whycommit does not force anything. It makes you stop and think.
- **Your notes live only on your computer.** If you switch computers, they can be lost.
- Grading is the agent's judgment and can be wrong. If you disagree, you can dispute once per question.
- **Fixed text comes in Korean and English only.** The agent talks in your language. The four record headings in PR and commit bodies (Today's work, Remaining work, What I understood, What I don't understand yet) and the labels in `notes.md` are written in Korean if you talk in Korean, and in English for any other language. The skill instructions themselves are written in Korean, which the agent reads either way.

## Supported agents

- **Claude Code**: tested.
- **Codex and other agents**: the skills follow the open [Agent Skills](https://agentskills.io) format, so they will likely work, but this has not been tested yet. Reports are welcome as issues.

## Repository layout

```text
whycommit/
├── .claude-plugin/
│   ├── plugin.json        plugin manifest (the version lives only here)
│   └── marketplace.json   lets this repository act as its own marketplace
├── skills/                Agent Skills standard skills
│   ├── commit/            SKILL.md, scripts/
│   ├── quiz/              SKILL.md, scripts/, references/
│   └── review/            SKILL.md, scripts/, references/
├── src/                   script sources. Edit only here
├── shared/                sources of documents shared by several skills (grading rules)
├── tools/
│   ├── sync-skills.mjs    copies the sources into the skill folders
│   └── install-skills.mjs installs as standard skills, without the plugin
├── test/                  script and skill-format tests
└── docs/plan.md           the planning document (Korean)
```

To release, change only `version` in `.claude-plugin/plugin.json`. If the version stays the same, people who already installed it do not get the update.

## Development

You only need Node.js 18 or newer and git. No external packages.

```sh
node test/run.mjs                   # script tests
node tools/sync-skills.mjs          # copy the sources into each skill folder
node tools/sync-skills.mjs --check  # check that the copies match (also runs in CI)
```

Each skill must not reference files outside its own folder (Agent Skills standard), so every skill keeps its own copy. Edit only the sources and copy them with the sync tool.

| Source | Copies |
|---|---|
| `src/` | `skills/*/scripts/` (every skill) |
| `shared/references/grading.md` | `skills/quiz/references/`, `skills/review/references/` (grading rules) |

Script rules:

- Always run them as `node <path>/wc.mjs <command>`. They do not rely on execute permissions or shebangs.
- Arguments carry only ASCII options and paths. Content such as questions, answers and explanations is passed in UTF-8 files.
- Each command prints one JSON object. Exit codes: 0 success, 1 failure, 2 usage error.
- Files are written as UTF-8 without BOM, with LF line endings.

## License

[MIT](LICENSE) © roof1004
