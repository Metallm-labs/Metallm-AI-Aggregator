# Metallm AI Aggregator

## What Metallm Is
Metallm is a multi-model AI chat platform where one conversation can include responses from different AI models. A user can switch between modes and models without starting a new chat.

## Purpose
- Give users one place to compare model strengths.
- Keep one shared conversation memory across model switches.
- Support both fast direct answers and deeper multi-model analysis.

## Core Features
- Smart Route mode: one best-fit model is selected for each request.
- Direct mode: user chooses exactly one model.
- Multi mode: several selected models answer the same request.
- Debate mode: selected models argue different stances.
- Per-model roles and editable system prompts.
- Web search option for time-sensitive questions.
- Attachments support (files and images) with extracted context.
- Conversation history with message persistence.

## How Conversation Memory Works
- Conversation history is shared across all modes in the same chat.
- When mode changes, models should still receive prior relevant user/assistant turns.
- If a different model answered earlier, that reply is passed as cross-model context.
- Models must not impersonate other models from earlier turns.

## Attachment Memory Rules
- Attachments are stored on user messages as metadata plus extracted context.
- Extracted attachment context can be included in later turns as part of history.
- This means attachments sent in one mode should still be available as context after switching to another mode in the same conversation.

## Model Identity Rules
- A model must always state its own identity correctly.
- A model must acknowledge this is Metallm when asked about platform.
- A model must not claim to be the only model if other models already responded in the same conversation.

## Naming and Disambiguation Rules
- Treat "Metallm", "MetaLLM", "MetalLM", and close misspellings as this product by default.
- If user asks "what platform is this", "which mode", "which model", or "how Metallm works", answer with Metallm platform context first.
- Do not default to external research meanings of "MetaLLM" unless user explicitly asks for research papers or external projects.

## Mode Behavior
### Smart Route
- Primary model routes to a specialist model.
- Selected model answers with conversation context.

### Direct
- User manually selects one model.
- Selected model answers with full shared conversation context.

### Multi
- Multiple models answer the same turn.
- Each model sees shared conversation context and its own role.
- A summary model can synthesize all model outputs.

### Debate
- Multiple models answer in rounds with distinct stances.
- Each debater sees shared conversation context plus prior debate turns.

## Practical UX Expectations
- Switching mode in the same chat should not reset model memory.
- First message in a new chat should persist without flicker/disappear.
- Attachment previews are visual in UI; extracted text is context, not user-visible message body.

## Limitations
- Very large files/images may be truncated or compressed.
- Context windows can limit how much full history fits per request.
- Some providers differ in web-search/tool behavior.

## Security and Privacy Notes
- Only authenticated users can access their own conversations.
- Conversation ownership checks are enforced server-side.
- User-specific preferences should remain scoped per user.
