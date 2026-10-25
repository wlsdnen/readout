# Reporting results with readout

When you report finished work, a result, a failure, a change, a comparison or an experiment, follow the `readout:explain` skill: write a result card, and reply in chat with the card's one-line verdict plus its link (`http://localhost:<port>/#card=<id>`).
For long terminal jobs, report progress with `readout.track` / `readout.emit` (or `python3 -m readout emit`); for LLM experiments, log each call with `readout.llm_call` so runs can be compared.
