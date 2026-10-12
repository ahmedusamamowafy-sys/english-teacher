# Research Notes and Product Decisions

Purpose: record which evidence-based methods shaped the app, how strong that evidence is, and how each is implemented and evaluated. Written for Ahmed (Arabic-speaking construction planning professional, level not yet assessed).

## How to read this document

- **Verified** = I located the source in a web search during this build (title and publisher confirmed). I could only see titles and links, not full texts, so effect sizes below are not quoted from the papers.
- **From background knowledge** = well-established findings I'm summarising from memory of the literature. Treat the specific claims as directional and check the cited source before relying on any number.
- Evidence strength (Strong / Moderate / Limited) is my own judgement of how well the finding applies to a single adult learner using software.

## Sources located during this build

| # | Source | Status |
|---|---|---|
| 1 | Council of Europe, *CEFR Companion Volume with New Descriptors* (2018; updated 2020). https://rm.coe.int/cefr-companion-volume-with-new-descriptors-2018/1680787989 | Verified exists |
| 2 | Dunlosky et al. (2013), *Improving Students' Learning With Effective Learning Techniques*, Psychological Science in the Public Interest. https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html | Verified exists |
| 3 | Lyster & Saito (2010), oral feedback in classroom SLA, *Studies in Second Language Acquisition*. https://www.cambridge.org/core/product/4999EE1C8379B2BF026B148EAF373CA1 | Verified exists |
| 4 | Bryfonski & McKay, *TBLT implementation and evaluation: A meta-analysis*. https://todoele.net/node/239896 | Verified listed (bibliography entry) |
| 5 | Systematic review: *Spaced repetition for vocabulary retention in EFL and ESL learning*. https://riset.unisma.ac.id/index.php/JREALL/article/view/25562 | Verified exists; lower-tier venue |
| 6 | Arabic phonology and English intelligibility. https://jls.tu.edu.iq/index.php/jls/article/view/1837 | Verified exists; lower-tier venue |

British Council LearnEnglish, Cambridge English and Oxford resources were not fetched. The app takes their *approach* (CEFR-levelled, communicative, skills-balanced) but copies none of their content.

## Method by method

### 1. CEFR as the level scale
- **Evidence**: Standard reference framework; the Companion Volume adds descriptors for mediation, online interaction and phonology (Source 1). It is a descriptive scale, not a validated test, so any self-built placement is an estimate.
- **Strength**: Strong as a framework; Limited as a measurement instrument in this app.
- **Implementation**: Each skill (speaking, listening, reading, writing, grammar, vocabulary, pronunciation) carries its own A1–C2 estimate. Estimates are Bayesian-style running scores that move slowly, never based on one answer. Placement mixes closed items (auto-scored) with AI-rated speaking and writing.
- **Evaluation**: Reassessment every 4 weeks with *different* items of matched difficulty; report change per skill with a confidence label (low/medium/high based on item count).

### 2. Spaced repetition and retrieval practice
- **Evidence**: Practice testing and distributed practice both rated high-utility in the Dunlosky review (Source 2). Source 5 reviews EFL/ESL vocabulary applications. Spacing effects are robust in lab and classroom work; gains for *long-term* L2 retention are well supported, though optimal intervals vary.
- **Strength**: Strong.
- **Implementation**: SM-2-style scheduler (`public/js/srs.js`) with four self-grades plus automatic grading for typed answers. Cards: vocabulary/collocations, *and the learner's own mistakes* (error cards). New-card cap per day to avoid overload.
- **Evaluation**: Track retention rate (reviews passed / reviews due) and mean interval growth; error recurrence rate per error type over rolling 2-week windows.

### 3. Corrective feedback in speaking
- **Evidence**: Lyster & Saito (Source 3) found feedback beneficial overall, with prompts (pushing the learner to self-correct) tending to outperform recasts in classroom settings (from background knowledge of the paper's headline finding; verify). Learners notice recasts less reliably.
- **Strength**: Moderate–Strong for effectiveness of feedback; Moderate for the prompts-over-recasts ordering.
- **Implementation**: Three modes as requested. Fluency = collect, feedback at end. Balanced = correct only errors that hinder meaning or recur. Intensive = correct most meaningful errors. In all modes the app shows: what you said, a corrected version, a short reason, an optional more natural version, TTS playback, and a *repeat-it* step (prompt-style, learner produces the correction). Acceptable variation is explicitly protected: the AI prompt forbids flagging a sentence that is grammatical and natural enough.
- **Evaluation**: Every logged error has `firstSeen`, `occurrences`, `lastSeen`. An error counts as "improving" after three correct uses in later sessions.

### 4. Task-based and communicative practice
- **Evidence**: TBLT meta-analytic work (Source 4) generally supports task-based instruction for communicative outcomes, with variation by design and measure. CLT is the mainstream approach in major publishers' frameworks.
- **Strength**: Moderate.
- **Implementation**: Conversation module is scenario-driven (site meeting, delay notice, claim discussion, job interview, stand-up update) with a goal and success criteria per scenario, using the learner's real domain.
- **Evaluation**: Words spoken per turn, pause/hesitation proxy (time to first word), and scenario goal completion over time.

### 5. Pronunciation training
- **Evidence**: Pronunciation instruction improves intelligibility, and the goal of *intelligibility over native accent* is the mainstream position in the field (from background knowledge: Derwing & Munro; Thomson & Derwing 2015). Source 6 discusses Arabic-phonology intelligibility issues. Commonly reported Arabic-L1 trouble spots (verify against Source 6): /p/–/b/ contrast, vowel inventory (e.g. /ɪ/–/iː/, /æ/–/ɛ/), consonant clusters (epenthesis), and word/sentence stress.
- **Strength**: Moderate.
- **Implementation**: Ordinary speech-to-text is **not** treated as a pronunciation measure. The app offers (a) listen–record–compare with waveform view, always labelled "self-comparison, not scored", and (b) optional phoneme-level scoring through Azure Speech Pronunciation Assessment when keys are configured; results are labelled **Measured**. LLM comments on transcripts are labelled **AI estimate**. Minimal-pair drills target the Arabic-L1 list above.
- **Evaluation**: Azure accuracy/fluency/prosody scores over time when available; otherwise minimal-pair discrimination accuracy.

### 6. Vocabulary and collocations
- **Evidence**: Strong general support for learning words in context with repeated meaningful encounters, and for multiword units for fluency (background knowledge: Nation; Schmitt).
- **Strength**: Moderate–Strong.
- **Implementation**: Cards store expression, meaning, collocations, examples, the learner's own sentence, first-seen date, review history. Content is built around construction/project controls plus general professional functions (agree, disagree, clarify, hedge).
- **Evaluation**: Share of cards with a learner-written sentence; production (not just recognition) pass rate.

### 7. Interleaving and deliberate practice
- **Evidence**: Interleaving is promising for category learning; evidence in L2 grammar is mixed.
- **Strength**: Limited–Moderate.
- **Implementation**: Daily plan interleaves skills; drills are generated from the learner's *own* error log, giving targeted deliberate practice.
- **Evaluation**: Compare error-type recurrence for drilled vs. non-drilled errors.

### 8. AI conversational tutors
- **Evidence**: Research on LLM tutors is new and uneven. Known risks: confident but wrong corrections, over-correction, and inflated praise.
- **Strength**: Limited.
- **Implementation**: Structured JSON feedback with a self-reported confidence field; "uncertain" corrections are shown as suggestions. Placement and reassessment rely mainly on auto-scored items. Teacher prompt demands honest progress reporting.
- **Evaluation**: Weekly spot-check screen where the learner can mark a correction as "wrong/unhelpful"; those are logged and reduce that error's weight.

## Product decisions that follow

1. Local-first PWA; data in a JSON file on your machine plus browser cache. No account, no cloud database.
2. Provider-agnostic AI layer; API keys live only in server `.env`.
3. Everything works without any key in **Offline mode** (auto-scored exams, SRS, drills, reading/listening, a small rule-based writing checker) so you are never blocked. AI and speech features switch on when you add keys.
4. Original content only; no scraped or proprietary material.
5. Honest labelling: *Measured* vs *AI estimate* vs *Self-comparison*.

## Limitations

- I could not read full texts, so quantitative effect sizes are deliberately omitted.
- Browser speech recognition quality varies by browser and accent; Chrome/Edge are the best-supported.
- Placement results are an estimate; treat them as a starting point, and take an official test (IELTS, Cambridge, etc.) if you need certified results.
