# Commands

The cmd feature provides a command palette for executing actions, opening URLs, and interacting with the app.

## Command Matching & Sorting

When the user types in the command bar, matching commands are sorted using a three-tier system:

### 1. Exact Match Priority

When the input contains parameters (e.g., `tag foo`), an exact command match is prioritized over prefix matches. This ensures `tag foo` executes the `tag` command, not `tags`.

### 2. Adaptive Scoring

The system learns from user behavior using asymptotic scoring:

```
score = count / (count + k)
```

Where:
- `count` = number of times user selected this command for this typed prefix
- `k` = dampening constant (currently 5)

This creates ever-strengthening reinforcement: the more you select a command for a given input, the higher it ranks. The asymptotic curve means early selections have high impact, then it plateaus.

Example: If you type "t" and select "tag" 10 times, the score is `10/(10+5) = 0.67`. After 100 selections: `100/(100+5) = 0.95`.

Adaptive feedback is stored in localStorage per typed-prefix → command pairs.

### 3. Match Count (Frecency Fallback)

If adaptive scores are equal, falls back to raw match count—how many times each command has been used overall.

## Implementation

- `findMatchingCommands(text)` in `panel.js` handles matching and sorting
- `updateAdaptiveFeedback(typed, name)` records user selections
- `getAdaptiveScore(typed, name)` retrieves learned scores

## Storage Keys

- `cmd:adaptiveFeedback` - typed prefix → command selection counts
- `cmd:matchCounts` - overall command usage counts
