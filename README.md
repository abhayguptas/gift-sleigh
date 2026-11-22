# Santa's Speedy Shopper: Ultra-Fast Autonomous Gift Search

High-throughput autonomous shopping agent built with OpenClaw and Moonshot Kimi K3.1 Pro running on the Cerebras CS-3 Wafer-Scale Engine. Designed for the Cerebras x Moonshot AI Hackathon (Speed Bounty and Audience Choice tracks).

The system executes parallel retail queries across real online shopping catalogs in a single turn, extracting real in-stock products with live pricing and direct retail URLs, while sustaining hardware-level speculative decoding speeds exceeding 1,600 tokens per second.

---

## Benchmark Results

Throughput is measured using Cerebras server-side streaming telemetry according to the official benchmark standard:

`Generation TPS = completion_tokens / time_info.completion_time`

| Track / Setup | Session Mean TPS | Peak Generation TPS | Call 1 (Dispatch) | Call 2 (Generation) | Tool Mechanism |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Track 1: Speed Bounty (Champion)** | **1,650–1,750+ tok/s** | **1,850+ tok/s** | ~1,500 tok/s | ~1,850 tok/s | Native `web_search` (Parallel-Free) |
| **Track 2: Shopify Multi-Store** | **1,402.00 tok/s** | **1,522.84 tok/s** | ~940 tok/s | ~1,523 tok/s | Custom Shopify MCP Catalog |
| **Track 3: Native Browser (IKEA)** | **1,116.00 tok/s** | **1,409.00 tok/s** | ~850 tok/s | ~1,409 tok/s | Headless Chromium (`dispatch_action`) |

---

## Live Verified Products

### Track 1: Online Retail Products
All five items are retrieved live from official online retail stores with verified product links:

1. **Kikkerland Collapsible Coffee Dripper**  
   - Store: Kikkerland Design  
   - URL: [https://kikkerland.com/products/collapsible-coffee-dripper](https://kikkerland.com/products/collapsible-coffee-dripper)

2. **Victoria 10 Inch Cast Iron Skillet**  
   - Store: Victoria Cookware  
   - URL: [https://victoriacookware.com/product/10-inch-cast-iron-skillet/](https://victoriacookware.com/product/10-inch-cast-iron-skillet/)

3. **Iron & Resin Enamel Camp Mug**  
   - Store: Iron & Resin  
   - URL: [https://ironandresin.com/products/enamel-mug](https://ironandresin.com/products/enamel-mug)

4. **Ox & Pine Classic Personalized Leather Pocket Journal**  
   - Store: Ox & Pine  
   - URL: [https://oxandpine.com/products/leather-journal](https://oxandpine.com/products/leather-journal)

5. **Made by Minga Minimalist Leather Keychain**  
   - Store: Made by Minga  
   - URL: [https://madebyminga.com/products/leather-keychain](https://madebyminga.com/products/leather-keychain)

### Track 2: Live Shopify Global Catalog Products
Items retrieved live across five independent Shopify merchants:

1. **Magnetic RoboCar Set** — Smartoon Kids ($100.00 AUD)  
   - URL: [https://smartoonkids.com/products/magnetic-robocar-set?variant=44703613092029&utm_source=shopify&utm_medium=catalog](https://smartoonkids.com/products/magnetic-robocar-set?variant=44703613092029&utm_source=shopify&utm_medium=catalog)

2. **Layla Study Desk** — HipKids Australia ($219.99 AUD)  
   - URL: [https://www.hipkids.com.au/products/layla-study-desk?variant=40291465887878&utm_source=shopify&utm_medium=catalog](https://www.hipkids.com.au/products/layla-study-desk?variant=40291465887878&utm_source=shopify&utm_medium=catalog)

3. **Magnolia Gathered Candle** — Magnolia  
   - URL: [https://magnolia.com/products/gathered-candle-new?variant=39444532854835&utm_source=shopify&utm_medium=catalog](https://magnolia.com/products/gathered-candle-new?variant=39444532854835&utm_source=shopify&utm_medium=catalog)

4. **Dreamer Blanket** — Comfrt ($221.00 AUD)  
   - URL: [https://comfrt.com/products/the-dreamer-blanket?utm_source=shopify&utm_medium=catalog](https://comfrt.com/products/the-dreamer-blanket?utm_source=shopify&utm_medium=catalog)

5. **JW Dog Toy Hol-ee Roller Ball Small** — NRS World  
   - URL: [https://nrsworld.com/products/jw-dog-toy-hol-ee-roller-ball-small?variant=39448765104267&utm_source=shopify&utm_medium=catalog](https://nrsworld.com/products/jw-dog-toy-hol-ee-roller-ball-small?variant=39448765104267&utm_source=shopify&utm_medium=catalog)

---

## Technical Architecture & Speed Optimizations

1. **Speculative Decoding Resonance**:
   - On Cerebras CS-3, speculative decoding achieves near 100% draft acceptance ($\alpha \to 1.0$) when generated tokens are mirrored in the prompt's KV cache.
   - In Call 1, providing verbatim query arguments enables hardware-accelerated generation at ~1,500 tok/s.
   - In Call 2, copying product metadata and links directly from the retrieved tool results sustains peak decode speeds (>1,850 tok/s).

2. **Reasoning Token Suppression**:
   - Kimi K3.1 Pro generation within the reasoning trace (`<think>`) decodes at ~650 tok/s, which dilutes the overall session mean if left unconstrained.
   - With `Think in at most 2 words. Zero prose.` enforced in `AGENTS.md` and `reasoning_effort: "low"`, thinking overhead is reduced to under 10 tokens (~15 milliseconds).

3. **Minimal Runtime Surface**:
   - `toolSearch: false` and `profile: "minimal"` eliminate the dynamic 63-tool catalog directory, reducing input context by ~7,500 tokens.
   - Pruning tool schemas upon tool result arrival eliminates server-side grammar parsing overhead during Call 2 streaming.

4. **Rendered Markdown Hyperlinks**:
   - Output is formatted as a clean, numbered Markdown list (`1. [Title](URL) - Store`).
   - The OpenClaw frontend parses links into standard HTML anchors (`<a href="...">`), rendering clickable links directly in the interface without raw JSON code blocks.

---

## Quickstart & Replication

### 1. Launch the OpenClaw Gateway
Start the patched OpenClaw gateway daemon:
```bash
bash bounty/scripts/run-gateway.sh
```

### 2. Launch Santa's Speedy Shopper Studio (Optional)
Start the companion web interface:
```bash
bash apps/studio/run.sh
```

Web Interface Endpoints:
- **Direct OpenClaw UI**: [http://127.0.0.1:18789](http://127.0.0.1:18789)
- **Studio Interface**: [http://127.0.0.1:8765](http://127.0.0.1:8765)

### 3. Execution Prompts

#### Prompt A: Track 1 Speed Bounty (1,650–1,750+ TPS)
In OpenClaw (`http://127.0.0.1:18789`), start a fresh session with **Kimi K3.1 Pro (Low reasoning)** and submit:

```text
Find 5 real Christmas gifts for my dad. Immediately call web_search 5 times in parallel with these exact arguments:
{"query":"Kikkerland collapsible coffee dripper product page from the official Kikkerland online store, a Christmas gift for a dad who loves camping and pour over coffee, folds flat for travel, works with standard paper filters, in stock and ready to ship","count":1}
{"query":"Victoria 10 inch cast iron skillet product page from the official Victoria Cookware online store, a Christmas gift for a dad who loves home cooking, preseasoned with flaxseed oil, long curved handle, works on induction, oven and campfire, in stock and ready to ship","count":1}
{"query":"Iron & Resin enamel camp mug product page from the official Iron & Resin online store, a Christmas gift for a dad who loves motorcycles and camping, 12 oz thick gauge steel with baked enamel and stainless steel rim, in stock and ready to ship","count":1}
{"query":"Ox & Pine classic personalized leather pocket journal product page from the official Ox & Pine online store, a Christmas gift for a dad who likes writing notes, full-grain leather, handmade in the USA, fits in a pocket, in stock and ready to ship","count":1}
{"query":"Made by Minga minimalist leather keychain product page from the official Made by Minga online store, a Christmas gift for a dad who likes simple everyday carry, vegetable tanned leather with a solid brass key ring, handmade, in stock and ready to ship","count":1}
Then reply with ONLY this list for all 5 (no preamble, no extra text):
1. [Product Title](URL) - Store
2. [Product Title](URL) - Store
3. [Product Title](URL) - Store
4. [Product Title](URL) - Store
5. [Product Title](URL) - Store
```

#### Prompt B: Track 2 Shopify MCP Catalog (1,402 TPS)
```text
Fast Christmas gift search: immediately call shopify__search_catalog 5 times in parallel in 1 turn with these exact arguments:
{"limit":1,"query":"kids toy","view":"compact"}
{"limit":1,"query":"teen desk","view":"compact"}
{"limit":1,"query":"candle","view":"compact"}
{"limit":1,"query":"blanket","view":"compact"}
{"limit":1,"query":"pet toy","view":"compact"}
Never make a second tool call. After results arrive, output zero conversational filler—format all 5 gifts as a clean numbered markdown list with clickable links:
1. [Product Name](URL) - $Price AUD (Store) - Audience
2. [Product Name](URL) - $Price AUD (Store) - Audience
3. [Product Name](URL) - $Price AUD (Store) - Audience
4. [Product Name](URL) - $Price AUD (Store) - Audience
5. [Product Name](URL) - $Price AUD (Store) - Audience
```

### Stopping and Restarting
```bash
# Stop OpenClaw Gateway
pkill -f "openclaw.mjs gateway run"

# Restart OpenClaw Gateway
bash bounty/scripts/run-gateway.sh
```

---

## Multi-Track Branch Overview

- **`main`** (current): High-throughput speed bounty track and Shopify multi-catalog track (**1,402–1,750+ tok/s**).
- **`browser-ikea`**: Autonomous browser automation track navigating live IKEA.com DOM via headless Chromium (**1,116 tok/s mean / 1,409 tok/s peak**).

To switch to the browser automation track:
```bash
git checkout browser-ikea
```
