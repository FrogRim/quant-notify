# Realtime Voice Quality Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Realtime conversation interruptions, improve conversation continuity, and improve user speech transcription accuracy.

**Architecture:** Keep the current browser WebRTC to OpenAI Realtime path, but tune three layers separately: session creation defaults in the API, runtime event handling in the web client, and prompt policy in the language-specific instruction builder. Treat STT, turn timing, and conversation policy as separate levers so their effects can be verified independently.

**Tech Stack:** Express API, React/Vite frontend, OpenAI Realtime API over WebRTC, TypeScript, Vitest/node:test where possible

---

## File Map

- Modify: `apps/api/src/services/openaiRealtime.ts`
  - Owns Realtime session creation payload, instructions, transcription defaults, and turn detection config.
- Modify: `apps/api/src/__tests__/aiInstructions.test.ts`
  - Regression coverage for instruction policy changes.
- Modify: `apps/web/src/lib/webVoiceClient.ts`
  - Owns browser-side Realtime data channel behavior, transcript assembly, and response trigger behavior.
- Create or modify: `apps/web/src/lib/webVoiceClient.test.ts` or nearby focused test file if the project pattern allows
  - Verifies transcript buffering / no premature partial assistant transcript behavior.
- Optional docs update: `docs/runbooks/production-readiness-checklist.md`
  - Only if manual QA steps need an audio quality regression item.

## Chunk 1: STT Accuracy

### Task 1: Add language-aware transcription hints

**Files:**
- Modify: `apps/api/src/services/openaiRealtime.ts`
- Test: `apps/api/src/__tests__/aiInstructions.test.ts`

- [ ] **Step 1: Write a failing or missing expectation for transcription config**

Add a focused assertion that the Realtime session payload includes language-aware transcription config for at least one non-English language and English.

- [ ] **Step 2: Run the relevant test file or fallback verification**

Run:
```bash
pnpm --filter lingua-call-api test -- src/__tests__/aiInstructions.test.ts
```
Expected: either a failing assertion for missing config, or environment-level `spawn EPERM` that must be documented.

- [ ] **Step 3: Implement minimal transcription improvements**

In `openaiRealtime.ts`:
- add a helper that maps app language codes to transcription language hints
- add a short transcription prompt such as:
  - stay in the selected learning language
  - preserve learner wording faithfully
  - avoid over-normalizing partial speech
- send these under `input_audio_transcription`

Target shape:
```ts
input_audio_transcription: {
  model: transcriptionModel,
  language: resolvedLanguageHint,
  prompt: transcriptionPrompt
}
```

- [ ] **Step 4: Run verification**

Run:
```bash
pnpm --filter lingua-call-api test -- src/__tests__/aiInstructions.test.ts
```
If blocked by environment, verify by static inspection and note the exact limitation.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/openaiRealtime.ts apps/api/src/__tests__/aiInstructions.test.ts
git commit -m "Improve Realtime transcription hints"
```

## Chunk 2: Turn Timing And Interruption Control

### Task 2: Make the model less eager to interrupt

**Files:**
- Modify: `apps/api/src/services/openaiRealtime.ts`
- Modify: `apps/web/src/lib/webVoiceClient.ts`

- [ ] **Step 1: Identify the current response trigger path**

Verify current behavior:
- server session uses `turn_detection`
- web client sends `response.create` immediately when the data channel opens

Run:
```bash
rg -n "response.create|turn_detection|silence_duration_ms" apps/api/src/services/openaiRealtime.ts apps/web/src/lib/webVoiceClient.ts
```

- [ ] **Step 2: Remove or gate the eager client-side response trigger**

In `webVoiceClient.ts`, stop forcing an immediate generic `response.create` on channel open unless there is a strong reason to do so.

The intended effect:
- let the server-side turn detection decide when to answer
- avoid speaking before the user turn is actually complete

- [ ] **Step 3: Adjust server turn detection defaults**

In `openaiRealtime.ts`, replace the current simplistic VAD config with a less interruptive default. Start with conservative settings, for example:

```ts
turn_detection: {
  type: "semantic_vad",
  eagerness: "low",
  create_response: true,
  interrupt_response: true
}
```

If the exact shape is not supported by the current API contract, fall back to the safest supported server-side configuration and document that choice in code comments sparingly.

- [ ] **Step 4: Prevent partial assistant text from being surfaced as final text too early**

In `webVoiceClient.ts`, keep buffering assistant text until the final completion event, and avoid promoting partial deltas into the visible transcript as if they were complete assistant turns.

- [ ] **Step 5: Run verification**

Run:
```bash
pnpm --filter lingua-call-web typecheck
```

If there is a focused web test file, run it too. Otherwise verify by static inspection of the event handling path.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/openaiRealtime.ts apps/web/src/lib/webVoiceClient.ts
git commit -m "Reduce Realtime interruption and premature speech"
```

## Chunk 3: Conversation Continuity Over Correction Bias

### Task 3: Rebalance the system prompt

**Files:**
- Modify: `apps/api/src/services/openaiRealtime.ts`
- Test: `apps/api/src/__tests__/aiInstructions.test.ts`

- [ ] **Step 1: Write failing or missing prompt-policy expectations**

Add assertions that instructions include all of the following:
- keep the conversation going
- correct only lightly and only when helpful
- do not correct every turn
- prioritize answering the learner before coaching

- [ ] **Step 2: Run the test or fallback verification**

Run:
```bash
pnpm --filter lingua-call-api test -- src/__tests__/aiInstructions.test.ts
```

- [ ] **Step 3: Rewrite instruction policy**

Across the language-specific builders in `openaiRealtime.ts`:
- reduce the emphasis on correction-first behavior
- add explicit policy such as:
  - keep the learner talking until the topic naturally closes
  - prioritize conversation flow over pronunciation coaching
  - correct only when the error blocks comprehension or when there is a natural pause
  - prefer one short correction after responding, not before responding

- [ ] **Step 4: Keep language-specific opening guarantees**

Do not regress the prior fix that ensures the first sentence is in the selected target language.

- [ ] **Step 5: Run verification**

Run:
```bash
pnpm --filter lingua-call-api test -- src/__tests__/aiInstructions.test.ts
```
and
```bash
pnpm --filter lingua-call-web typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/openaiRealtime.ts apps/api/src/__tests__/aiInstructions.test.ts
git commit -m "Rebalance Realtime coaching toward conversation flow"
```

## Chunk 4: Manual QA

### Task 4: Real browser verification

**Files:**
- Reference: `docs/runbooks/production-readiness-checklist.md`
- Optional Modify: `docs/runbooks/production-readiness-checklist.md`

- [ ] **Step 1: Define the manual test script**

Verify three scenarios in the deployed app:
- user pauses briefly mid-thought and the assistant does not jump in too early
- assistant keeps the topic going instead of correcting every turn
- STT preserves the learner utterance more faithfully for Korean-accented English and at least one non-English target language

- [ ] **Step 2: Run browser verification after deployment**

Use:
- English session
- Japanese or French session
- one intentionally imperfect learner utterance
- one long sentence with a brief pause in the middle

Expected:
- fewer mid-sentence interruptions
- fewer assistant corrections per turn
- more faithful transcript capture

- [ ] **Step 3: Update the checklist if needed**

If the QA script proves useful, add a short subsection to `production-readiness-checklist.md`.

- [ ] **Step 4: Commit docs only if changed**

```bash
git add docs/runbooks/production-readiness-checklist.md
git commit -m "Add Realtime voice quality QA checklist"
```

