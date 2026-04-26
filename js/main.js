// Chat widget
(function () {
  const style = document.createElement('style');
  style.textContent = `
    #cb-chat-btn {
      position: fixed; bottom: 24px; right: 24px; width: 58px; height: 58px;
      border-radius: 50%; background: #dc2626; color: #fff; border: none;
      cursor: pointer; font-size: 24px; display: flex; align-items: center;
      justify-content: center; box-shadow: 0 4px 16px rgba(220,38,38,0.45);
      z-index: 9999; transition: transform 0.2s, background 0.2s;
    }
    #cb-chat-btn:hover { transform: scale(1.08); background: #b91c1c; }
    #cb-chat-window {
      position: fixed; bottom: 94px; right: 24px; width: 360px;
      max-height: 540px; background: #0f0f0f; border: 1px solid #1f1f1f;
      border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      display: none; flex-direction: column; z-index: 9998; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #cb-chat-window.open { display: flex; }
    #cb-chat-header {
      background: #dc2626; color: #fff; padding: 14px 18px;
      display: flex; align-items: center; justify-content: space-between;
    }
    #cb-chat-header .cb-title { font-weight: 700; font-size: 14px; letter-spacing: .02em; }
    #cb-chat-header .cb-sub { font-size: 12px; opacity: 0.85; margin-top: 2px; }
    #cb-close-btn {
      background: none; border: none; color: #fff; font-size: 18px;
      cursor: pointer; opacity: 0.8; line-height: 1;
    }
    #cb-close-btn:hover { opacity: 1; }
    #cb-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 10px;
      min-height: 280px; max-height: 370px;
    }
    .cb-msg {
      max-width: 82%; padding: 10px 14px; border-radius: 16px;
      font-size: 13px; line-height: 1.55; word-wrap: break-word;
    }
    .cb-msg.user {
      align-self: flex-end; background: #dc2626; color: #fff;
      border-bottom-right-radius: 4px;
    }
    .cb-msg.bot {
      align-self: flex-start; background: #1a1a1a; color: #e5e5e5;
      border-bottom-left-radius: 4px;
    }
    .cb-msg.typing { align-self: flex-start; background: #1a1a1a; color: #737373; font-style: italic; font-size: 13px; }
    #cb-input-area {
      padding: 12px 14px; border-top: 1px solid #1f1f1f;
      display: flex; gap: 8px; align-items: center;
    }
    #cb-input {
      flex: 1; background: #1a1a1a; border: 1px solid #2a2a2a; color: #e5e5e5;
      border-radius: 22px; padding: 9px 16px; font-size: 13px;
      outline: none; transition: border-color 0.2s; font-family: inherit;
    }
    #cb-input:focus { border-color: #dc2626; }
    #cb-input::placeholder { color: #555; }
    #cb-send-btn {
      background: #dc2626; color: #fff; border: none; border-radius: 50%;
      width: 36px; height: 36px; cursor: pointer; font-size: 15px;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s; flex-shrink: 0;
    }
    #cb-send-btn:hover { background: #b91c1c; }
    #cb-send-btn:disabled { background: #3a3a3a; cursor: not-allowed; }
  `;
  document.head.appendChild(style);

  document.body.insertAdjacentHTML('beforeend', `
    <button id="cb-chat-btn" title="Chat with us">💬</button>
    <div id="cb-chat-window">
      <div id="cb-chat-header">
        <div>
          <div class="cb-title">Chat with CBMarketing</div>
          <div class="cb-sub">We reply instantly</div>
        </div>
        <button id="cb-close-btn" title="Close">✕</button>
      </div>
      <div id="cb-messages">
        <div class="cb-msg bot">Hi! 👋 I'm the CBMarketing AI. Ask me anything about our services or how AI automation can help your business.</div>
      </div>
      <div id="cb-input-area">
        <input id="cb-input" type="text" placeholder="Ask a question..." autocomplete="off" />
        <button id="cb-send-btn" title="Send">➤</button>
      </div>
    </div>
  `);

  const chatBtn = document.getElementById('cb-chat-btn');
  const chatWindow = document.getElementById('cb-chat-window');
  const closeBtn = document.getElementById('cb-close-btn');
  const messagesEl = document.getElementById('cb-messages');
  const input = document.getElementById('cb-input');
  const sendBtn = document.getElementById('cb-send-btn');
  let history = [];

  chatBtn.addEventListener('click', () => {
    chatWindow.classList.toggle('open');
    if (chatWindow.classList.contains('open')) input.focus();
  });
  closeBtn.addEventListener('click', () => chatWindow.classList.remove('open'));
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  sendBtn.addEventListener('click', send);

  function addMsg(text, role) {
    const d = document.createElement('div');
    d.className = `cb-msg ${role}`;
    d.textContent = text;
    messagesEl.appendChild(d);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return d;
  }

  function showLeadCapture() {
    const inputArea = document.getElementById('cb-input-area');
    inputArea.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;width:100%;padding:4px 0">
        <input id="cb-lead-name" placeholder="Your name" style="background:#1a1a1a;border:1px solid #2a2a2a;color:#e5e5e5;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;font-family:inherit"/>
        <input id="cb-lead-email" placeholder="Your email" style="background:#1a1a1a;border:1px solid #2a2a2a;color:#e5e5e5;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;font-family:inherit"/>
        <button onclick="window._cbSubmitLead()" style="background:#dc2626;color:#fff;border:none;border-radius:8px;padding:9px;font-size:13px;cursor:pointer;font-family:inherit">Take me there →</button>
      </div>`;
    addMsg("Before I send you over — what's your name and email so we can follow up?", 'bot');

    window._cbSubmitLead = async () => {
      const name = document.getElementById('cb-lead-name').value.trim();
      const email = document.getElementById('cb-lead-email').value.trim();
      if (name) {
        fetch('/api/chat-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, notes: history.map(m => `${m.role}: ${m.content}`).join('\n') }),
        }).catch(() => {});
      }
      window.location.href = '/contact.html';
    };
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendBtn.disabled = true;
    input.disabled = true;
    addMsg(text, 'user');
    history.push({ role: 'user', content: text });
    const typing = addMsg('Typing...', 'typing');
    try {
      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
      });
      const data = await res.json();
      typing.remove();
      let reply = data.reply || 'Sorry, something went wrong. Please try again.';
      const shouldRedirect = reply.includes('[[BOOK]]');
      reply = reply.replace('[[BOOK]]', '').trim();
      addMsg(reply, 'bot');
      history.push({ role: 'assistant', content: reply });
      if (shouldRedirect) setTimeout(() => showLeadCapture(), 1800);
    } catch {
      typing.remove();
      addMsg('Connection error. Please try again.', 'bot');
    }
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }
})();

// Mobile menu
const toggle = document.querySelector('.menu-toggle');
const mobileMenu = document.querySelector('.mobile-menu');
if (toggle && mobileMenu) {
  toggle.addEventListener('click', () => mobileMenu.classList.toggle('open'));
}

// Active nav link
const path = location.pathname.replace(/\/$/, '') || '/index.html';
document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(a => {
  const href = a.getAttribute('href');
  if (href === path || (path === '/index.html' && href === '/') || path.endsWith(href)) {
    a.classList.add('active');
  }
});

// FAQ accordion
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// Contact form
const form = document.getElementById('contact-form');
if (form) {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    const data = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      business: form.business.value.trim(),
      service: form.service.value,
      message: form.message.value.trim(),
    };

    try {
      const res = await fetch('/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        form.style.display = 'none';
        document.getElementById('form-success').style.display = 'block';
      } else {
        throw new Error();
      }
    } catch {
      btn.disabled = false;
      btn.textContent = 'Send Message';
      alert('Something went wrong. Please email us directly at cbmarketing020@gmail.com');
    }
  });
}
