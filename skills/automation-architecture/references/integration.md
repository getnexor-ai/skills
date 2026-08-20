# The integration compass

Use this when the requirement is *integration* — moving data between Nexor and another system. It expands rung 3 and rungs 5/7 of the decision ladder in [SKILL.md](../SKILL.md) for the sync case, and pairs with the outbound-trigger semantics in [semantics.md](semantics.md). Functions are the fully flexible path: editable JavaScript with `axios` available, so any external API is reachable in both directions.

## Resolve sync direction before choosing a surface

Treat "sync this information" as incomplete until the direction is explicit. Determine whether the data is moving **into Nexor** or **out of Nexor** before recommending or configuring anything. If the request does not make the direction clear, present those two mutually exclusive choices and wait for the answer; do not guess from the word "sync."

For data moving **into Nexor**, classify every incoming key before mapping it:

- Put lead identity and delivery coordinates in the standard lead columns: `first_name`, `last_name`, `email`, and `phone`. Update them through the normal lead create/update contract, never through metadata. Metadata does not change the address or number Nexor uses to contact the lead.
- Put every other reusable customer fact the agent should know in `lead.metadata`. Create/upsert with a `metadata` object or shallow-merge it with `PATCH`/`PUT /api/public/leads/:id`; use `PATCH /api/public/leads/metadata` for bulk merges. The complete metadata object is loaded into the next agent execution, so a value written now is available on the next turn/run without copying it into prompt prose.
- Add a workflow field with `metadata_key` only when the same value must pre-fill an intake question or participate in a field-only status gate. Metadata remains the source of inbound context; the field is the structural bridge.

For data moving **out of Nexor**, choose the outbound trigger from the table below. Metadata may be the source value included in a payload, but writing metadata is not an outbound sync mechanism and sends nothing by itself.

| Direction | Cadence | Use | Why |
|-----------|---------|-----|-----|
| Nexor → external | Status change | Outbound webhook or status automation | Platform state fires it deterministically; no model tool-selection decision |
| Nexor → external | Field/variable or lead event | Cloud function | The event fires deterministically; custom code can inspect the changed key and call any endpoint |
| Nexor ↔ external | During the agent's turn, no usable state trigger | Workflow HTTP/MCP tool | Use only when the agent needs the response immediately; the client's endpoint remains the source of truth, but model-selected invocation is less reliable |
| Nexor → external | Batch | Scheduled function sweep | Cohort in `ctx.leads[]`, push out per lead or aggregated |
| External → Nexor | Push (they call you) | Public leads API / inbound hook | Upsert + metadata + enrollment in one request, no code |
| External → Nexor | Pull (Nexor calls them) | Scheduled function | Query the entire leads object with Supabase-style chained filters, `axios` the external API, then create/edit leads with custom metadata via effects or the public API |

Deterministic mechanisms win when they express the timing: rules, webhooks, status automations, and event-triggered cloud functions do not depend on the model remembering or deciding to call a tool. Do not copy a client's round-robin, CRM ownership, pricing, or eligibility logic into a prompt or function when their endpoint already owns it. Use an agent-callable tool only when the active conversation truly requires its response before continuing.

## Client-owned capabilities and deterministic execution

Treat the client's endpoint as the capability and Nexor as the orchestrator:

1. Identify whether a status, field, variable, lead, meeting, or workflow event defines the moment of execution. If it does, wire that event to a webhook, status automation, or cloud function; do not ask the agent to call the endpoint.
2. Keep the authoritative business decision in the endpoint. Nexor passes facts; neither the agent nor a function should duplicate the client's algorithm.
3. Use a conversational HTTP/MCP tool only when the agent must obtain the result inside the active turn and a deterministic trigger cannot run it first.
4. For remaining agent-callable tools, set `available_in_statuses` to the exact valid status keys. Pair a `qualified` gate with `requires_all_fields` / `required_field_keys` so availability and booking cannot run before qualification.
5. Use `call_once` for irreversible conversational operations that must run once per workflow run; leave it off read-only tools that may need a legitimate refresh.
6. Define success, failure, persistence, and retry behavior. Never let the agent invent an assignment, slot, price, or external result after a failed call.

Read the workflow-tool and stage-gate contract in [configuration-reference.md](configuration-reference.md) and use the round-robin mapping in [recipes.md](recipes.md) when the ask resembles sales-rep assignment.
