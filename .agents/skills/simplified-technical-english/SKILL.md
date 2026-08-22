---
name: simplified-technical-english
description: >-
  Ensures documentation is written using Google Developer Docs Style Guide principles 
  and Simplified Technical English (STE). Use this skill when asked to write, refactor, 
  or review documentation, READMEs, or comments.
---

# Simplified Technical English (Google Developer Docs Style)

When applying this skill, you must act as a strict technical editor and writer adhering to the Google Developer Documentation Style Guide and ASD-STE100 (Simplified Technical English) principles.

## Core Directives

1. **Active Voice & Present Tense**
   - **Do:** Use the active voice. (e.g., "The system processes the request.")
   - **Do not:** Use passive voice. (e.g., "The request is processed by the system.")
   - **Do:** Use simple present tense. (e.g., "The command starts the server.")
   - **Do not:** Use future tense unless necessary. (e.g., "The command will start the server.")

2. **Second Person Point of View**
   - **Do:** Address the reader directly as "you". 
   - **Do not:** Use "we", "I", or "the user".

3. **Sentence and Paragraph Limits**
   - Keep instructional sentences under **20 words**.
   - Keep descriptive sentences under **25 words**.
   - Limit paragraphs to a maximum of **6 sentences**.
   - Give **only one instruction** per sentence.

4. **Vocabulary & Terminology**
   - Use standard US English spelling.
   - Avoid idioms, jargon, and complex metaphors.
   - Avoid gerunds ("-ing" words) as subjects or verbs. (e.g., Use "To configure the server" instead of "Configuring the server").
   - Do not use noun clusters of more than 3 words.

5. **Formatting Rules**
   - **Bold**: Use for UI elements (e.g., Click **Save**).
   - **Code / Monospace**: Use for code snippets, file names, file extensions, and variable names.
   - **Links**: Use descriptive link text. Never use "Click here", "Link", or "Read more".
   - **Lists**: Use numbered lists for sequential steps. Use bulleted lists for non-sequential items. Ensure parallel construction in lists (start all items with a verb, or all items with a noun).

## Workflow for Writing/Reviewing Documentation

1. **Analyze the Request:** Understand the target audience (developers) and the goal of the document.
2. **Draft Content:** Write the content keeping the Core Directives in mind. 
3. **Run the STE Self-Audit Checklist:**
   - [ ] Is every sentence in the active voice?
   - [ ] Are all instructions in the imperative mood? (e.g., "Run the script.")
   - [ ] Is there only one instruction per sentence?
   - [ ] Are all sentences under 25 words?
   - [ ] Did I avoid saying "we" or "the user"? (Use "you" instead).
   - [ ] Is the link text descriptive?
   - [ ] Are code elements properly formatted with backticks?

When returning documentation to the user, ensure it strictly passes the self-audit checklist above.
