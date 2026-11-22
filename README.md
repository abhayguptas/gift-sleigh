# Santa's Speedy Shopper: Autonomous Gift Search Engine

High-throughput autonomous shopping agent built with **OpenClaw** and **Moonshot Kimi K3.1 Pro** running on the **Cerebras CS-3 Wafer-Scale Engine**. 

Built for the **Cerebras x Moonshot AI Hackathon** ($1,000 Speed Bounty & $4,000 Audience Choice tracks).

**Team Member:** Abhay Gupta (<abhayakg123@gmail.com>)  
**Repository:** [https://github.com/abhayguptas/gift-sleigh](https://github.com/abhayguptas/gift-sleigh)

---

## What It Does

Santa's Speedy Shopper is an autonomous agent that searches real retail catalogs for verified Christmas gifts across different audiences (Kids, Teens, Adults, Grandparents, Pets).

Instead of making slow, sequential tool calls or returning synthetic placeholder links, Santa's Speedy Shopper:
1. **Dispatches parallel tool calls in a single turn** across live online retail catalogs (Shopify Global Catalog, IKEA, or Web Search).
2. **Returns 5 real, in-stock products** with direct, clickable retail store URLs and verified pricing.
3. **Maximizes hardware throughput** using Cerebras speculative decoding to achieve generation speeds up to **1,402–1,750+ tokens per second (TPS)**.

---

## Speed Benchmarks

Throughput is measured directly from Cerebras server-side streaming decode timing (`time_info.completion_time` and `usage.completion_tokens`) using the official OpenClaw speed patch:

$$\text{Generation TPS} = \frac{\text{completion\_tokens}}{\text{completion\_time}}$$

| Track | Tested Speed | Tool Mechanism | Format |
| :--- | :--- | :--- | :--- |
| **Track 1: Maximum TPS Bounty** | **1,650–1,750+ tok/s** | OpenClaw `web_search` (Parallel-Free) | Clean Markdown list with links |
| **Track 2: Autonomous Shopify MCP** | **1,402.00 tok/s mean** (1,523 peak) | Parallel 5x Shopify Global Catalog | Verbatim JSON / Cart overlay |
| **Track 3: Shopify Live Markdown** | **945.4 tok/s Call 1** (1,073 peak) | Parallel 5x Shopify Global Catalog | 5 clickable Markdown links |
| **Track 4: Native Browser Automation** | **1,116.00 tok/s mean** (1,409 peak) | Headless Chromium on IKEA.com | Real DOM extraction |

---

## 5 Verified Real Products (Zero Placeholders)

All returned products are 100% real items currently live on actual retail stores:

1. **Magnetic RoboCar Set**  
   - Store: Smartoon Kids  
   - Price: $100.00 AUD  
   - URL: [https://smartoonkids.com/products/magnetic-robocar-set](https://smartoonkids.com/products/magnetic-robocar-set?variant=44703613092029&utm_source=shopify&utm_medium=catalog)

2. **Layla Study Desk**  
   - Store: HipKids Australia  
   - Price: $219.99 AUD  
   - URL: [https://www.hipkids.com.au/products/layla-study-desk](https://www.hipkids.com.au/products/layla-study-desk?variant=40291465887878&utm_source=shopify&utm_medium=catalog)

3. **Magnolia Gathered Candle**  
   - Store: Magnolia  
   - URL: [https://magnolia.com/products/gathered-candle-new](https://magnolia.com/products/gathered-candle-new?variant=39444532854835&utm_source=shopify&utm_medium=catalog)

4. **The Dreamer Blanket**  
   - Store: Comfrt  
   - Price: $221.00 AUD  
   - URL: [https://comfrt.com/products/the-dreamer-blanket](https://comfrt.com/products/the-dreamer-blanket?utm_source=shopify&utm_medium=catalog)

5. **JW Pet Hol-ee Roller Dog Toy Ball**  
   - Store: NRS World  
   - URL: [https://nrsworld.com/products/jw-dog-toy-hol-ee-roller-ball-small](https://nrsworld.com/products/jw-dog-toy-hol-ee-roller-ball-small?variant=39448765104267&utm_source=shopify&utm_medium=catalog)

---

## How It Works (In Simple Terms)

1. **Parallel Execution in 1 Turn:**
   Instead of asking the model to query one store at a time (which takes 5 separate round trips), the agent dispatches all 5 product queries simultaneously in Call 1.
2. **Speculative Decoding Resonance:**
   Cerebras Wafer-Scale Engine (CS-3) generates tokens at ultra-high speeds by predicting and accepting blocks of tokens matching prompt/KV context. By feeding structured catalog queries and copying retrieved links directly, speculative acceptance stays near 100%, allowing generation rates above 1,400+ tok/s.
3. **Low Reasoning Effort (`reasoning_effort: "low"`):**
   Kimi K3.1 Pro's internal reasoning tokens (`<think>`) generate autoregressively at ~650 tok/s. Suppressing reasoning overhead to under 10 tokens ensures that 98%+ of output generation runs through the high-speed speculative engine.
4. **Tool Schema Pruning on Call 2:**
   Once tool results return, unused tool definitions are pruned from the request, eliminating server-side grammar verification delays and unlocking instant streaming.

---

## Quickstart

### 1. Launch OpenClaw Gateway
```bash
bash bounty/scripts/run-gateway.sh
```
OpenClaw will run locally at `http://127.0.0.1:18789`.

### 2. Run the Benchmark Prompt
Open `http://127.0.0.1:18789` in your browser, select **Kimi K3.1 Pro (Cerebras)** with **Low** reasoning, and submit:

```text
Fast Christmas gift search: immediately call search_catalog 5 times in parallel in 1 turn with these exact arguments:
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

### 3. Companion Studio App (Optional)
Launch the Santa's Speedy Shopper Studio dashboard:
```bash
bash apps/studio/run.sh
```
Open [http://127.0.0.1:8765](http://127.0.0.1:8765) to view live shopping cart cards and latency breakdowns.
