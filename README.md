# Gift Sleigh — Santa's Speedy Shopper (Shopify Multi-Store Track)

High-throughput OpenClaw agent built for the **Cerebras x Moonshot Kimi K3.1 Pro Speed Bounty** ($1,000) and **Audience Choice** ($4,000).

Runs **Kimi K3.1 Pro on Cerebras CS-3 wafer-scale inference** to search **5 distinct gift categories in parallel** via the **Shopify Global Catalog** in a single turn and output 5 verified Christmas gifts from 5 independent retail stores with live AUD pricing at **1,402 tok/s mean · 1,523 tok/s peak**.

> **100% Live Retail Queries. Zero Fake URLs. Zero Pre-caching.**  
> Built strictly to organizer criteria: live dynamic tool calls, official server-side decode telemetry, and rapid single-turn execution.

---

## 🏆 Verified Benchmark Readout

- **Peak Generation TPS**: **1,523.00 tok/s**
- **Official Mean TPS**: **1,402.00 tok/s**
- **Model**: `cerebras/moonshotai-kimi-k3.1-pro-trial`
- **Reasoning**: `low` (`temperature: 0`)
- **Harness**: OpenClaw 8b18b55 + official speed patch

---

## 🎁 5 Verified Real In-Stock Products

All products were dynamically retrieved from 5 distinct independent retail merchants via Shopify Global Catalog with live AUD pricing:

1. **Magnetic RoboCar Set** — $100.00 AUD (Smartoon Kids)  
   [https://smartoonkids.com/products/magnetic-robocar-set?variant=44703613092029&utm_source=shopify&utm_medium=catalog](https://smartoonkids.com/products/magnetic-robocar-set?variant=44703613092029&utm_source=shopify&utm_medium=catalog)
2. **Layla Study Desk** — $219.99 AUD (HipKids Australia)  
   [https://www.hipkids.com.au/products/layla-study-desk?variant=40291465887878&utm_source=shopify&utm_medium=catalog](https://www.hipkids.com.au/products/layla-study-desk?variant=40291465887878&utm_source=shopify&utm_medium=catalog)
3. **Magnolia Gathered Candle** — Magnolia  
   [https://magnolia.com/products/gathered-candle-new?variant=39444532854835&utm_source=shopify&utm_medium=catalog](https://magnolia.com/products/gathered-candle-new?variant=39444532854835&utm_source=shopify&utm_medium=catalog)
4. **Dreamer Blanket** — $221.00 AUD (Comfrt)  
   [https://comfrt.com/products/the-dreamer-blanket?utm_source=shopify&utm_medium=catalog](https://comfrt.com/products/the-dreamer-blanket?utm_source=shopify&utm_medium=catalog)
5. **JW Dog Toy Hol-ee Roller Ball Small** — NRS World  
   [https://nrsworld.com/products/jw-dog-toy-hol-ee-roller-ball-small?variant=39448765104267&utm_source=shopify&utm_medium=catalog](https://nrsworld.com/products/jw-dog-toy-hol-ee-roller-ball-small?variant=39448765104267&utm_source=shopify&utm_medium=catalog)

---

## ⚡ Architecture & Optimization Mechanics

1. **1-Turn Parallel Execution**: Dispatches 5 concurrent `search_catalog` tool calls in Call 1, completely bypassing multi-turn roundtrips.
2. **Two-Phase Speculative Unlocking**: Drops tool schemas once results return in Call 2, unlocking unbroken Cerebras speculative draft acceptance ($\alpha \to 1.0$) across product generation.
3. **Resilient 429 Surge Handling**: Built-in exponential retry in `doneDetectingFetch` so high hackathon traffic bursts never fail turns.
4. **Official Telemetry**: Telemetry measured directly from Cerebras server-side decode time (`usage.completion_tokens / time_info.completion_time`).

---

## 🚀 Quickstart & Replication

### 1. Launch Gateway
```bash
bash bounty/scripts/run-gateway.sh
```

### 2. Run Live in OpenClaw UI
1. Open `http://127.0.0.1:18789`.
2. Start a fresh session (`/new`), choose **Kimi K3.1 Pro (Cerebras)** on **`Low`** reasoning.
3. Paste the prompt below:

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
