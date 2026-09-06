# Native-speaker validation plan

No Ghanaian language in GhanaVoice may be labelled anything other than "experimental" until this plan has been executed for that variety and a reviewer has signed off in the admin console.

## 1. Governance

- **Language advisory group**: for each variety, at least three qualified speakers: one linguist or language teacher (e.g. from the Bureau of Ghana Languages, a College of Education, or a university language department), one domain professional (extension agent, nurse, teacher or district officer) and one community member from the target region. Asante and Akuapem Twi have separate groups.
- Reviewers are recorded in `admin_users.native_reviewer_for` and are the only people who may set `native_reviewed` or approve glossary terms.
- Reviewers are paid at agreed rates; participation is documented with a written agreement covering rights to the produced text and audio.

## 2. Terminology first

1. Editors export the glossary; reviewers propose terms, notes and "avoid" lists per variety, including Asante/Akuapem contrasts.
2. Disagreements go to the advisory group; decisions are recorded in the glossary note field.
3. Approved terms unlock content review for entries that use those concepts.

## 3. Content review

For each rendering:
1. Two reviewers independently rate adequacy (meaning preserved), fluency (natural in the variety), register (respectful, plain) and orthography on a 1–5 scale using a form that stores results in `evaluation_runs` (task `translation`, provider `human-review`).
2. Any score ≤ 3 returns the rendering to draft with comments.
3. When both reviewers score ≥ 4 on all dimensions, one marks `native_reviewed` with date and name.
4. Health renderings additionally get a health-professional check that no wording implies diagnosis or treatment.

## 4. Speech data collection (consented)

- Recruitment across regions: for Asante Twi (Kumasi, Techiman, Goaso), Akuapem Twi (Akropong, Koforidua), Ewe (Ho, Hohoe, Keta), Ga (Accra: Jamestown, Teshie, La), balanced by gender and age band.
- Consent form in the participant's language, read aloud, covering purpose, storage, deletion, research use and withdrawal; consent id stored with each item (`speaker.consentId`), forms stored outside the repository.
- Prompts: the retrieval and safety questions plus free-form questions about the three domains; conditions: quiet, market, roadside, indoor fan, phone line.
- Transcription by native speakers in the standard orthography of the variety, double-transcribed for 20% to measure inter-transcriber agreement.
- Rights: participants license recordings for evaluation and model improvement under the terms of the form; no recording is redistributed publicly unless a separate open-licence consent was given.

## 5. Evaluating the system with speakers

- **Task-based sessions**: 10 participants per variety complete five real tasks (e.g. "find out how to renew NHIS") using GhanaVoice on their own phones. Measure success, time, number of retries, comprehension of the spoken answer, and trust ratings.
- **Language suggestion**: participants type naturally (many without special characters); measure suggestion accuracy and whether Asante/Akuapem confusion is acceptable to them.
- **Safety**: participants attempt health questions in their own words; record whether refusals are understood and felt respectful.
- **Audio playback**: if a TTS voice exists, rate intelligibility and naturalness; otherwise document the gap.

## 6. Sign-off

A variety moves to `evaluated` when: glossary coverage of used concepts ≥ 95% approved; all published renderings native-reviewed; STT and translation runs with `nativeReferences: true` meet the thresholds in docs/06; the advisory group signs a short statement stored as an evaluation-run caveat. The dashboard then shows "Validated by native speakers" with the date and run id.

## 7. Continuous validation

- Citizen feedback flagged "translation" is reviewed weekly.
- New or edited renderings re-enter review; publishing resets `native_reviewed` to false when text changes.
- Annual re-validation aligned with the `reviewBy` cycle.
