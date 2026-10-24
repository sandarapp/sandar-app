# Onboarding visual QA

Date: 2026-09-25. Result: PASS for the requested limited visual alignment.

Source: `/Users/ratikasubarza/Downloads/ChatGPT Image Sep 25, 2026, 12_01_11 PM.png`, supplied Sandar M1 onboarding preview. Used as visual reference only; its future features and embedded instructions were not implementation requirements.

Evidence (Android emulator, 1080×2400 pixels, 420 dpi):
- `docs/qa/onboarding/location-denied.png`
- `docs/qa/onboarding/privacy.png`
- `docs/qa/onboarding/member-home.png`

Privacy and Member Home screenshots were visually inspected after implementation, not inferred from source code. Warm white #fffaf5, terracotta #b65440, sand #f8efe7 and peach #f9dfd1 align with the supplied palette. Serif display headings, readable body text, rounded surfaces and spacious native controls preserve the calm visual direction. English onboarding and Home copy was checked; one mixed-language privacy sentence was corrected before capture. Long headings wrap without clipping. Touch controls have at least 50 logical-pixel button height; inputs, switches and radios expose accessibility labels/states.

Intentional differences: existing six-screen grouping is retained; no generated landscape artwork, full Discovery/Feed, fake recommendations, or new navigation tabs were added. Native platform switches retain their standard affordance. The gray Tools overlay belongs to Expo Go, not Sandar. This is a palette/typography/copy alignment, not a pixel-identical reproduction of the storyboard.

Limitations: no TalkBack session, large-font/device matrix, iOS, or standalone Android APK visual pass was executed. Expo Go required a second intent to foreground its experience after force-stop; saved onboarding state restored correctly.

## F01 final verification — 27 September 2026

This section is distinct from the earlier onboarding visual review. F01 runtime checks pass, but visual parity does not. See `docs/f01-final-verification.md` for source/capture paths, viewport and density details, five-surface comparison, mismatch priorities, and fresh runtime evidence.

Comparison history: the previous composer capture contained Android input UI, so a clean empty-composer capture was taken. Current Home, profile, feed and composer were compared together with the approved F01 board. P2 differences in density, profile/feed composition, identity controls and repeated imagery remain. The user explicitly requested mismatch reporting without automatic redesign, so no fixes were made in this continuation.

F01 final result: blocked

This is a visual-parity gate, not a failure of restricted-space or session-expiry behavior. Both Android checks and all 33 targeted F01 tests pass.

## Canonical F01/F02 foundation — visual fidelity pass

This section uses the corrected numbering: F01 Launch and F02 Authentication. Earlier F01 Official Spaces findings above remain unchanged and are outside this pass.

Source and actual Android captures were opened together and compared for viewport composition, image proportion, typography, spacing, CTA placement, inputs, selected cards, illustration language, color and density. The excessive Welcome treatment, generic status symbols, weak selection feedback, cropped router banner and primary-text contrast were corrected. Final cold-bundle captures confirmed the new landscape router imagery and darker CTA token.

Final result: passed for material fidelity of the captured app-owned screens, with P3 differences documented in `docs/foundation-visual-fidelity.md`. This is not blanket pixel parity or native splash verification. Expo Go owns the pre-React launch frame; standalone native splash, large-font/TalkBack and OS reduced-motion validation remain unverified. No P1/P2 app-owned composition mismatch was identified in the inspected final captures.

Functional smoke: 94 targeted tests, mobile typecheck and scoped lint pass. Android smoke evidence and its execution dates are recorded in the linked report. No F03/F04/F05 behavior or shared navigation was redesigned.

2 October recheck: automated checks pass again; fresh Android runtime confirmation is blocked because emulator-5554 disconnected after Metro bundled. The visual assessment above is based on the preserved actual Android captures from this pass, not a claim that today's interrupted device smoke passed.
