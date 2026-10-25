# Card types

Each file here is one built-in card type: when it fits, which blocks it fills, what "before/after" means for it, and how confidence is judged. `src/readout/cards.py` holds the block kinds; the dashboard draws every kind, so adding a type is adding a file.
A user's own types live in `<data folder>/card-types/` (`$READOUT_DIR`, else `~/.claude/readout`) in the same format, so they survive plugin updates; one there overrides a built-in of the same name.

Frontmatter:
- `name`: the card's `type` value
- `status`: `proposed` (in a card's `proposal`, not a file yet) → `trial` (file written after the user chose 채택 or 수정) → `adopted` (the user kept it through later uses)
- `use_when`: the work it fits, read when choosing
- `blocks_required`, `blocks_optional`: block kinds from `cards.py` `KINDS`

Deciding a new type (the `readout:explain` skill runs this):
1. No type fits → the card uses the common skeleton and carries `proposal: {typeName, why, blocks}`.
2. One question: 채택 / 수정 / 이번만. 채택 or 수정 → write `<data folder>/card-types/<name>.md` with `status: trial`.
3. A `trial` type the user kept in a later card → `adopted`. A type unused for a long stretch → ask whether to delete it.
4. When the user says a card's block is useless or something is missing, propose the edit to that type's file.
