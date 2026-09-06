# Conversation flows

All flows start with the disclaimer banner visible and the selected language shown. Text in Ghanaian languages below is illustrative and marked as draft in the code.

## Flow A: text question, confident answer

1. User selects Asante Twi, types "Mɛyɛ dɛn akyerɛw me din agye Ghana Card?"
2. Client heuristic sees Twi; no suggestion because it matches the selected group.
3. `/api/ask` → safety rules: none → retrieval finds `ghana-card-registration` (Asante rendering) → extractive answer (summary).
4. Card shows: title, answer text, confidence badge (medium: translation not native-reviewed, language experimental), sources with NIA link and dates, "Ask a person", feedback buttons.

## Flow B: voice question with consent

1. User holds the microphone button. First time: consent dialog explains storage, deletion period choice (1/7/30 days), optional research use. Declining still allows voice.
2. On release, audio (Opus, under 2 MB) is posted to `/api/transcribe` with the consent decision.
3. The transcript appears in the user's bubble with provider name and confidence (or "confidence not reported"). If the provider does not claim support for the language, the bubble says so and asks the user to check the words.
4. The question proceeds as Flow A. If `autoPlay` is on and a voice exists, the answer is read aloud; otherwise a notice explains that no voice exists for the language.

## Flow C: language suggestion

1. User has English selected but types "Aleke mawɔ aŋlɔ ŋkɔ ɖe Ghana Card ƒe nu".
2. After three words the client shows "This looks like Ewe. Switch? [Switch] [Keep]". Nothing changes until the user taps Switch.

## Flow D: uncertain

1. Query matches nothing above threshold.
2. Card: "I am not certain about this. Please check the sources or ask a person." plus "You may be looking for" with up to three nearest topics (labelled as suggestions) and the "Ask a person" button.

## Flow E: health question, general

1. "How can I prevent malaria at home?" → category `health_general` (not blocked).
2. Answer from `malaria-prevention` with the health disclaimer and escalation to the nearest CHPS compound.

## Flow F: health question, diagnosis or prescription (blocked)

1. "Do I have malaria?" → category `health_diagnosis`.
2. Card titled "I cannot tell you what illness someone has", explains why, gives the health-facility path, emergency guidance for red-flag symptoms, and offers general prevention information. No retrieval answer is shown.

## Flow G: emergency

1. "My father collapsed and is not breathing."
2. Emergency box first: tap-to-call 112 / 191 / 192 / 193, statement that GhanaVoice cannot send help, then the emergency-numbers citation.

## Flow H: escalation to a human

1. User taps "Ask a person".
2. `/api/escalate` returns a reference (e.g. GV-XXXX) and the partner contact for the domain; in full mode a ticket is created for the institution's queue. The card explains that the question was shared because the user asked.

## Flow I: offline

1. Device offline: banner "You are offline. Showing saved information only."
2. Typed questions are answered by `searchPacks` over downloaded packs; card marks "Answered offline from a downloaded pack" and confidence is capped at medium.
3. Voice is disabled offline with an explanatory message.

## Flow J: feedback

1. "Not helpful" or "Report translation problem" opens a small form: issue type and optional better wording, with a note that reviewers will read it and that personal details should not be included.
2. Analytics receives only counts; the suggested text goes to `feedback_suggestions`.

## Flow K: administrator publishing

1. Editor creates or edits an entry (JSON form with schema validation) → status draft → "→ in_review".
2. Reviewer (different person) checks sources, marks renderings native-reviewed where applicable → "→ approved" or back to draft with a note.
3. Publisher publishes; gates: source verified within 12 months, health flag present. Index invalidates; packs rebuild on next request.

## Spoken-answer style guide

- Lead with the action ("Call 112", "Go to the NIA office"), then one supporting detail.
- One idea per sentence; no nested lists in the summary field; numbers as digits.
- Avoid English loan phrases where an approved glossary term exists.
- Never say "you have", "take", or name a medicine in health content.
