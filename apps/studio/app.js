const CHAT_EMBED = '/__openclaw__/';

async function clearEmbedServiceWorker() {
  try {
    if (navigator.serviceWorker?.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
    if (window.caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    /* embed can still try */
  }
}
const PROMPT_PATH = 'locked-prompt.txt';

const FALLBACK_PROMPT = `Fast Christmas gift search using the native browser tool via dispatch_action in 2 steps:
Step 1: call dispatch_action with {"id":"browser","args":{"action":"navigate","targetUrl":"https://www.ikea.com/us/en/search/?q=christmas+gift"}}.
Step 2: call dispatch_action with {"id":"browser","args":{"action":"act","request":{"kind":"evaluate","fn":"async()=>{for(let i=0;i<50&&document.querySelectorAll('[data-testid=\\"plp-product-card\\"]').length<5;i++)await new Promise(r=>setTimeout(r,100));const A=['Kids','Adults','Teens','Family','Home'],g=[],s=new Set();for(const c of document.querySelectorAll('[data-testid=\\"plp-product-card\\"]')){const a=c.querySelector('a[href*=\\"/p/\\"]'),p=c.innerText.match(/\\\\$(\\\\d+(?:\\\\.\\\\d{2})?)/),n=(c.querySelector('.plp-price-module__product-name,h3')?.innerText||'').replace(/[^a-zA-Z0-9 +-]/g,' ').replace(/\\\\s+/g,' ').replace(/\\\\s+\\\\d+(?:\\\\s+\\\\d+)*(?:\\\\s*(?:hr|oz))?$/i,'').trim();if(!a||!p||!n||s.has(a.href)||/wrap|bag|ribbon|tape|label/i.test(n))continue;s.add(a.href);g.push({name:n,url:a.href.split('?')[0],price_usd:+p[1],store:'IKEA',audience:A[g.length],description:n,reason:'Great Christmas gift',currency:'USD',availability:'In Stock',category:'Christmas Gift'});if(g.length===5)break}return{gifts:g}}"}}}
Never make a third tool call. After Step 2 returns the 5 live products, output zero prose and no markdown—only one compact single-line JSON copying the returned object verbatim:
{"gifts":[{"name":"","url":"","price_usd":0,"store":"","audience":"","description":"","reason":"","currency":"","availability":"","category":""}]}`;

async function loadPrompt() {
  let text = FALLBACK_PROMPT;
  try {
    const r = await fetch(`${PROMPT_PATH}?v=${Date.now()}`);
    if (r.ok) text = (await r.text()).trim();
  } catch {
    /* fallback */
  }
  for (const id of ['locked', 'locked-mobile']) {
    const el = document.getElementById(id);
    if (el) el.value = text;
  }
}

async function setGatewayState(ok) {
  const status = document.getElementById('gw-status');
  const frame = document.getElementById('oc');
  const hint = document.getElementById('frame-hint');
  const openTab = document.getElementById('open-tab');
  const text = status?.querySelector('.status-text');

  if (ok) {
    status?.classList.add('ok');
    status?.classList.remove('bad');
    if (text) text.textContent = 'Online';
    if (hint) {
      hint.hidden = false;
      hint.innerHTML =
        'Embed preview below. For <strong>readable tok/s</strong>, use <strong>Open chat</strong> (full Control UI on :18789).';
    }
    if (openTab) openTab.classList.remove('disabled');
    if (frame && !frame.dataset.loaded) {
      frame.dataset.loaded = '1';
      await clearEmbedServiceWorker();
      frame.src = `${CHAT_EMBED}?embed=1`;
    }
    return;
  }

  status?.classList.add('bad');
  status?.classList.remove('ok');
  if (text) text.textContent = 'Offline';
  if (frame) frame.removeAttribute('src');
  if (hint) {
    hint.hidden = false;
    hint.textContent = 'Gateway offline — run bounty/scripts/run-gateway.sh, then refresh.';
  }
  if (openTab) openTab.classList.add('disabled');
}

async function probeGateway() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(CHAT_EMBED, { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok && r.status !== 405) throw new Error('down');
    setGatewayState(true);
  } catch {
    setGatewayState(false);
  }
}

function copyPrompt(btn) {
  const text = document.getElementById('locked')?.value || document.getElementById('locked-mobile')?.value;
  navigator.clipboard.writeText(text).then(() => {
    const prev = btn.textContent;
    btn.textContent = 'Copied';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = prev;
      btn.disabled = false;
    }, 1400);
  }).catch(() => {
    btn.textContent = 'Failed';
  });
}

document.getElementById('copy')?.addEventListener('click', (e) => copyPrompt(e.currentTarget));
document.getElementById('copy-mobile')?.addEventListener('click', (e) => copyPrompt(e.currentTarget));

loadPrompt();
probeGateway();
setInterval(probeGateway, 20_000);