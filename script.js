// ==========================================================================
// AKNOVA AI — frontend logic
// Talks to /.netlify/functions/chat, which holds the real API key server-side.
// ==========================================================================

const chatScroll   = document.getElementById('chatScroll');
const messagesEl    = document.getElementById('messages');
const welcomeEl     = document.getElementById('welcome');
const form          = document.getElementById('composerForm');
const input         = document.getElementById('composerInput');
const sendBtn       = document.getElementById('sendBtn');
const newChatBtn    = document.getElementById('newChatBtn');
const historyList   = document.getElementById('historyList');
const menuBtn       = document.getElementById('menuBtn');
const sidebar       = document.getElementById('sidebar');
const sidebarClose  = document.getElementById('sidebarClose');
const sidebarOverlay= document.getElementById('sidebarOverlay');
const attachBtn      = document.getElementById('attachBtn');
const imageInput     = document.getElementById('imageInput');
const imagePreviewRow    = document.getElementById('imagePreviewRow');
const imagePreviewThumb  = document.getElementById('imagePreviewThumb');
const imagePreviewRemove = document.getElementById('imagePreviewRemove');
const micBtn         = document.getElementById('micBtn');
const liveVoiceBtn = document.getElementById('liveVoiceBtn');
const liveVoiceOverlay = document.getElementById('liveVoiceOverlay');
const liveVoiceClose = document.getElementById('liveVoiceClose');
const liveVoiceOrb = document.getElementById('liveVoiceOrb');
const liveVoiceStatus = document.getElementById('liveVoiceStatus');
const liveVoiceTranscript = document.getElementById('liveVoiceTranscript');

const ENDPOINT = '/.netlify/functions/chat';

// In-memory only — no chat persistence to a database yet (see README for
// how to add that). Theme preference IS saved, since it's just a UI setting.
let conversations = [];      // [{ id, title, messages: [{role, content}] }]
let activeId = null;
let isStreaming = false;
let activeAbortController = null;
let pendingImage = null; // { dataUrl } attached to the NEXT message only

// --------------------------------------------------------------------------
// Conversation helpers
// --------------------------------------------------------------------------

function newConversation() {
  const convo = { id: crypto.randomUUID(), title: null, messages: [] };
  conversations.unshift(convo);
  activeId = convo.id;
  renderHistory();
  renderMessages();
  welcomeEl.style.display = 'block';
  messagesEl.innerHTML = '';
  input.value = '';
  autoResize();
  closeSidebarOnMobile();
}

function getActive() {
  return conversations.find(c => c.id === activeId);
}

function renderHistory() {
  if (conversations.length === 0) {
    historyList.innerHTML = '<p class="history-empty">Your conversations will show up here.</p>';
    return;
  }
  historyList.innerHTML = '';
  conversations.forEach(c => {
    const item = document.createElement('div');
    item.className = 'history-item' + (c.id === activeId ? ' active' : '');

    const label = document.createElement('button');
    label.className = 'history-item-label';
    label.type = 'button';
    label.textContent = c.title || 'New chat';
    label.addEventListener('click', () => {
      activeId = c.id;
      renderHistory();
      renderMessages();
      closeSidebarOnMobile();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'history-delete-btn';
    delBtn.type = 'button';
    delBtn.setAttribute('aria-label', 'Delete chat');
    delBtn.title = 'Delete chat';
    delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 011-1h1a1 1 0 011 1v1.5M6 7.5v4M10 7.5v4M4 4.5l.6 8.4a1 1 0 001 .9h4.8a1 1 0 001-.9l.6-8.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(c.id);
    });

    item.appendChild(label);
    item.appendChild(delBtn);
    historyList.appendChild(item);
  });
}

function deleteConversation(id) {
  const idx = conversations.findIndex(c => c.id === id);
  if (idx === -1) return;
  const wasActive = id === activeId;
  conversations.splice(idx, 1);

  if (wasActive) {
    if (conversations.length > 0) {
      activeId = conversations[0].id;
      renderMessages();
    } else {
      newConversation();
      return; // newConversation already re-renders history
    }
  }
  renderHistory();
}

function renderMessages() {
  const convo = getActive();
  messagesEl.innerHTML = '';
  if (!convo || convo.messages.length === 0) {
    welcomeEl.style.display = 'block';
    return;
  }
  welcomeEl.style.display = 'none';
  convo.messages.forEach((m, i) => appendMessageEl(m.role, m.content, { index: i, image: m.image }));
  scrollToBottom();
}

// --------------------------------------------------------------------------
// Markdown-lite rendering
// --------------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdownLite(text) {
  // Proper markdown (tables, headings, lists, bold/italic, code) via marked,
  // sanitized via DOMPurify so nothing unsafe ever gets injected.
  if (typeof marked !== 'undefined') {
    let html = marked.parse(text, { breaks: true, gfm: true });
    if (typeof DOMPurify !== 'undefined') html = DOMPurify.sanitize(html);
    // Wrap tables so wide ones scroll horizontally instead of breaking layout.
    html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
    return html;
  }
  // Fallback if the CDN scripts didn't load (e.g. offline) — plain escaped text.
  const escaped = escapeHtml(text);
  return escaped.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('') || `<p>${escaped}</p>`;
}

// --------------------------------------------------------------------------
// Copy to clipboard
// --------------------------------------------------------------------------

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  const original = btn.innerHTML;
  btn.classList.add('copied');
  btn.innerHTML = 'Copied';
  setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = original; }, 1500);
}

const COPY_ICON = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 10.5V3.5A1.5 1.5 0 014.5 2h7" stroke="currentColor" stroke-width="1.3"/></svg>';
const REGEN_ICON = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M13.5 8A5.5 5.5 0 013 10.2M2.5 8A5.5 5.5 0 0113 5.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M13 3v3h-3M3 13v-3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const EDIT_ICON = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-8 8-3.5.5.5-3.5 8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';

// --------------------------------------------------------------------------
// Rendering a single message
// --------------------------------------------------------------------------

function appendMessageEl(role, content, { thinking = false, index = null, image = null } = {}) {
  welcomeEl.style.display = 'none';

  const row = document.createElement('div');
  row.className = `msg ${role}`;
  if (index !== null) row.dataset.index = index;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  if (role === 'assistant') {
    avatar.innerHTML = `<span class="nova-mark ${thinking ? 'nova-mark--thinking' : ''}">
      <span class="nova-glow"></span>
      <span class="nova-core"></span>
      <span class="nova-ring nova-ring--1"></span>
      <span class="nova-ring nova-ring--2"></span>
    </span>`;
  } else if (role === 'user') {
    avatar.textContent = 'YOU';
  } else {
    avatar.textContent = '!';
  }

  const body = document.createElement('div');
  body.className = 'msg-body';

  const roleLabel = document.createElement('div');
  roleLabel.className = 'msg-role';
  roleLabel.textContent = role === 'assistant' ? 'AKNOVA' : role === 'user' ? 'You' : 'Error';

  body.appendChild(roleLabel);

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.className = 'msg-image';
    img.alt = 'Attached image';
    body.appendChild(img);
  }

  const textEl = document.createElement('div');
  textEl.className = 'msg-text';
  textEl.innerHTML = thinking
    ? '<span class="thinking-dots">Thinking…</span>'
    : renderMarkdownLite(content);
  body.appendChild(textEl);

  // Action row: copy on everything; regenerate on assistant; edit on user.
  if (!thinking && role !== 'error') {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.innerHTML = COPY_ICON + '<span>Copy</span>';
    copyBtn.addEventListener('click', () => copyText(content, copyBtn));
    actions.appendChild(copyBtn);

    if (role === 'assistant' && index !== null) {
      const regenBtn = document.createElement('button');
      regenBtn.className = 'msg-action-btn';
      regenBtn.innerHTML = REGEN_ICON + '<span>Regenerate</span>';
      regenBtn.addEventListener('click', () => regenerate(index));
      actions.appendChild(regenBtn);
    }

    if (role === 'user' && index !== null) {
      const editBtn = document.createElement('button');
      editBtn.className = 'msg-action-btn';
      editBtn.innerHTML = EDIT_ICON + '<span>Edit</span>';
      editBtn.addEventListener('click', () => startEdit(index, body, textEl, actions, content));
      actions.appendChild(editBtn);
    }

    body.appendChild(actions);
  }

  row.appendChild(avatar);
  row.appendChild(body);
  messagesEl.appendChild(row);
  return { row, textEl };
}

function scrollToBottom() {
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

// --------------------------------------------------------------------------
// Edit a past user message → truncate conversation from there → resend
// --------------------------------------------------------------------------

function startEdit(index, body, textEl, actions, originalText) {
  const box = document.createElement('div');
  box.className = 'edit-box';
  box.innerHTML = `
    <textarea class="edit-textarea">${escapeHtml(originalText)}</textarea>
    <div class="edit-actions">
      <button type="button" class="edit-btn cancel">Cancel</button>
      <button type="button" class="edit-btn save">Save &amp; submit</button>
    </div>`;

  textEl.style.display = 'none';
  actions.style.display = 'none';
  body.appendChild(box);

  const ta = box.querySelector('.edit-textarea');
  ta.style.height = ta.scrollHeight + 'px';
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  box.querySelector('.cancel').addEventListener('click', () => {
    box.remove();
    textEl.style.display = '';
    actions.style.display = '';
  });

  box.querySelector('.save').addEventListener('click', () => {
    const newText = ta.value.trim();
    if (!newText) return;
    const convo = getActive();
    convo.messages = convo.messages.slice(0, index);
    renderMessages();
    sendMessage(newText);
  });
}

// --------------------------------------------------------------------------
// Regenerate a past assistant reply
// --------------------------------------------------------------------------

function regenerate(index) {
  if (isStreaming) return;
  const convo = getActive();
  convo.messages = convo.messages.slice(0, index); // drop this reply + anything after
  renderMessages();
  runAssistantTurn(convo);
}

// --------------------------------------------------------------------------
// Sending a message
// --------------------------------------------------------------------------

async function sendMessage(text) {
  if ((!text.trim() && !pendingImage) || isStreaming) return;

  if (!activeId) newConversation();
  const convo = getActive();

  const imageForThisTurn = pendingImage;
  convo.messages.push({ role: 'user', content: text || 'Describe this image.', image: imageForThisTurn });
  clearPendingImage();

  if (!convo.title) {
    convo.title = (text || 'Image').slice(0, 42) + (text.length > 42 ? '…' : '');
    renderHistory();
  }
  renderMessages();

  input.value = '';
  autoResize();
  updateSendState();

  await runAssistantTurn(convo, imageForThisTurn);
}

async function runAssistantTurn(convo, imageForThisTurn = null) {
  renderMessages();
  const { textEl, row } = appendMessageEl('assistant', '', { thinking: true });
  scrollToBottom();

  isStreaming = true;
  setComposerStreaming(true);
  activeAbortController = new AbortController();

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: activeAbortController.signal,
      body: JSON.stringify({
        messages: convo.messages.map(m => ({ role: m.role, content: m.content })),
        image: imageForThisTurn || undefined
      })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Request failed (${res.status})`);
    }

    const data = await res.json();
    const reply = data.reply || '(no response)';
    convo.messages.push({ role: 'assistant', content: reply });
    renderMessages();
    if (window.novaLiveVoice && window.novaLiveVoice.active) window.novaLiveVoice.speak(reply);
  } catch (err) {
    if (err.name === 'AbortError') {
      convo.messages.push({ role: 'assistant', content: '_Generation stopped._' });
      renderMessages();
    } else {
      textEl.classList.remove('nova-mark--thinking');
      textEl.innerHTML = renderMarkdownLite(
        `Something went wrong reaching AKNOVA: ${err.message}. Please try again.`
      );
      row.classList.add('error');
    }
  } finally {
    isStreaming = false;
    activeAbortController = null;
    setComposerStreaming(false);
    scrollToBottom();
  }
}

// --------------------------------------------------------------------------
// Composer behavior (send / stop toggle)
// --------------------------------------------------------------------------

function autoResize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
}

function updateSendState() {
  sendBtn.disabled = !isStreaming && input.value.trim().length === 0 && !pendingImage;
}

function setComposerStreaming(streaming) {
  const btn = document.getElementById('sendBtn');
  if (streaming) {
    btn.className = 'stop-btn';
    btn.setAttribute('aria-label', 'Stop generating');
    btn.title = 'Stop generating';
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><rect width="12" height="12" rx="2" fill="currentColor"/></svg>';
  } else {
    btn.className = 'send-btn';
    btn.setAttribute('aria-label', 'Send message');
    btn.title = '';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h11M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  updateSendState();
}

input.addEventListener('input', () => { autoResize(); updateSendState(); });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value;
  sendMessage(text);
});

sendBtn.addEventListener('click', (e) => {
  if (isStreaming) {
    e.preventDefault();
    if (activeAbortController) activeAbortController.abort();
  }
  // otherwise: default submit behavior handles sending
});

document.querySelectorAll('.prompt-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    input.value = chip.dataset.prompt;
    autoResize();
    updateSendState();
    sendMessage(input.value);
  });
});

newChatBtn.addEventListener('click', newConversation);

// --------------------------------------------------------------------------
// Sidebar (mobile)
// --------------------------------------------------------------------------

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('open');
}
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
}
function closeSidebarOnMobile() {
  if (window.innerWidth <= 820) closeSidebar();
}
menuBtn.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

// --------------------------------------------------------------------------
// Init
// --------------------------------------------------------------------------

newConversation();
updateSendState();

// --------------------------------------------------------------------------
// Starfield background — lightweight canvas, no libraries
// --------------------------------------------------------------------------

(function starfield() {
  const canvas = document.getElementById('starfield');
  const ctx = canvas.getContext('2d');
  let stars = [];
  let w, h;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    const count = Math.floor((w * h) / 9000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.1 + 0.2,
      baseAlpha: Math.random() * 0.5 + 0.15,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.015 + 0.005
    }));
  }

  function tick(t) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const twinkle = Math.sin(t * s.speed + s.phase) * 0.35;
      ctx.globalAlpha = Math.max(0, s.baseAlpha + twinkle);
      ctx.fillStyle = '#F1EEFB';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(tick);
})();

// --------------------------------------------------------------------------
// Login — Netlify Identity (email/password + Google)
// Setup required in Netlify dashboard: Site configuration → Identity →
// Enable Identity, then Registration/External providers → enable Google.
// See README.md for full steps.
// --------------------------------------------------------------------------

(function auth() {
  const loginBtn  = document.getElementById('loginBtn');
  const userChip  = document.getElementById('userChip');
  const userName  = document.getElementById('userName');
  const userAvatar= document.getElementById('userAvatar');
  const logoutBtn = document.getElementById('logoutBtn');

  if (!window.netlifyIdentity) return;

  function showLoggedIn(user) {
    const meta = user.user_metadata || {};
    const name = meta.full_name || user.email.split('@')[0];
    userName.textContent = name;
    if (meta.avatar_url) {
      userAvatar.style.backgroundImage = `url(${meta.avatar_url})`;
    }
    loginBtn.hidden = true;
    userChip.hidden = false;
  }

  function showLoggedOut() {
    loginBtn.hidden = false;
    userChip.hidden = true;
    userAvatar.style.backgroundImage = '';
  }

  netlifyIdentity.on('init', (user) => user ? showLoggedIn(user) : showLoggedOut());
  netlifyIdentity.on('login', (user) => { showLoggedIn(user); netlifyIdentity.close(); });
  netlifyIdentity.on('logout', showLoggedOut);

  loginBtn.addEventListener('click', () => netlifyIdentity.open('login'));
  logoutBtn.addEventListener('click', () => netlifyIdentity.logout());

  netlifyIdentity.init();
})();

// --------------------------------------------------------------------------
// Image attach (upload) — sent to the vision-capable Groq model
// --------------------------------------------------------------------------

function clearPendingImage() {
  pendingImage = null;
  imagePreviewRow.hidden = true;
  imagePreviewThumb.src = '';
  imageInput.value = '';
}

attachBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', () => {
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Please choose an image file.');
    imageInput.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('Image is too large — please choose one under 5MB.');
    imageInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pendingImage = reader.result; // data:image/...;base64,....
    imagePreviewThumb.src = pendingImage;
    imagePreviewRow.hidden = false;
    updateSendState();
  };
  reader.readAsDataURL(file);
});

imagePreviewRemove.addEventListener('click', clearPendingImage);

// --------------------------------------------------------------------------
// Voice input — Web Speech API (works best in Chrome-based browsers)
// --------------------------------------------------------------------------

(function voiceInput() {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    micBtn.style.display = 'none'; // not supported in this browser
    return;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';

  let listening = false;
  let baseText = '';

  recognition.addEventListener('start', () => {
    listening = true;
    baseText = input.value ? input.value + ' ' : '';
    micBtn.classList.add('recording');
  });

  recognition.addEventListener('result', (e) => {
    let transcript = '';
    for (let i = 0; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    input.value = baseText + transcript;
    autoResize();
    updateSendState();
  });

  recognition.addEventListener('end', () => {
    listening = false;
    micBtn.classList.remove('recording');
  });

  recognition.addEventListener('error', () => {
    listening = false;
    micBtn.classList.remove('recording');
  });

  micBtn.addEventListener('click', () => {
    if (listening) {
      recognition.stop();
    } else {
      try { recognition.start(); } catch { /* already started */ }
    }
  });
})();


// ChatGPT-style hands-free voice conversation (browser-native audio layer).
(function liveVoice(){
  if (!liveVoiceBtn || !liveVoiceOverlay) return;

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  let recognition = null;
  let active = false;
  let listening = false;
  let speaking = false;
  let finalBuffer = '';

  const status = (text) => { liveVoiceStatus.textContent = text; };

  function open() {
    liveVoiceOverlay.hidden = false;
    liveVoiceOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('live-voice-open');
    liveVoiceBtn.classList.add('active');
    status(Recognition ? 'Starting microphone…' : 'Use Chrome or Edge for Live Voice');
  }

  function close() {
    active = false;
    listening = false;
    speaking = false;
    finalBuffer = '';
    if (recognition) { try { recognition.abort(); } catch {} }
    if (synth) synth.cancel();
    liveVoiceOverlay.hidden = true;
    liveVoiceOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('live-voice-open');
    liveVoiceBtn.classList.remove('active');
    liveVoiceOrb.classList.remove('listening', 'speaking', 'thinking');
  }

  function start() {
    if (!Recognition || !active || listening || speaking || isStreaming) return;

    if (!recognition) {
      recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        listening = true;
        finalBuffer = '';
        liveVoiceTranscript.textContent = 'Listening…';
        liveVoiceOrb.classList.add('listening');
        liveVoiceOrb.classList.remove('thinking', 'speaking');
        status('Listening…');
      };

      recognition.onresult = (event) => {
        let text = '';
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
          if (event.results[i].isFinal) finalBuffer += event.results[i][0].transcript + ' ';
        }
        liveVoiceTranscript.textContent = text || 'Listening…';
      };

      recognition.onend = () => {
        listening = false;
        liveVoiceOrb.classList.remove('listening');
        const text = finalBuffer.trim();
        finalBuffer = '';
        if (active && text) send(text);
        else if (active && !speaking) status('Tap the orb and speak');
      };

      recognition.onerror = (event) => {
        listening = false;
        liveVoiceOrb.classList.remove('listening');
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          status('Microphone blocked — allow microphone access in your browser');
        } else if (event.error !== 'aborted') {
          status('Could not hear you — tap the orb and try again');
        }
      };
    }

    try {
      recognition.start();
    } catch (error) {
      // Browser can throw if start is called twice; the existing session is fine.
    }
  }

  async function send(text) {
    if (!active || !text || isStreaming) return;
    liveVoiceTranscript.textContent = text;
    status('Thinking…');
    liveVoiceOrb.classList.add('thinking');
    try {
      await sendMessage(text);
    } finally {
      liveVoiceOrb.classList.remove('thinking');
      if (active && !speaking) setTimeout(start, 250);
    }
  }

  function speak(text) {
    if (!active || !synth) return;
    synth.cancel();
    speaking = true;
    liveVoiceOrb.classList.remove('thinking', 'listening');
    liveVoiceOrb.classList.add('speaking');
    status('AKNOVA is speaking…');

    const clean = String(text)
      .replace(/```[\s\S]*?```/g, ' code omitted ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_#>\[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = navigator.language || 'en-US';
    utterance.rate = 1.02;
    utterance.onend = () => {
      speaking = false;
      liveVoiceOrb.classList.remove('speaking');
      if (active) {
        status('Listening…');
        setTimeout(start, 180);
      }
    };
    utterance.onerror = () => {
      speaking = false;
      liveVoiceOrb.classList.remove('speaking');
      if (active) setTimeout(start, 180);
    };
    synth.speak(utterance);
  }

  liveVoiceBtn.addEventListener('click', () => {
    open();
    active = true;
    if (!Recognition) {
      status('Use Chrome or Edge for Live Voice');
      return;
    }
    setTimeout(start, 150);
  });

  liveVoiceClose.addEventListener('click', close);
  liveVoiceOverlay.addEventListener('click', (event) => {
    if (event.target === liveVoiceOverlay) close();
  });

  liveVoiceOrb.addEventListener('click', () => {
    active = true;
    if (speaking) {
      synth.cancel();
      speaking = false;
    }
    if (!listening) start();
    else if (recognition) { try { recognition.stop(); } catch {} }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !liveVoiceOverlay.hidden) close();
  });

  window.novaLiveVoice = {
    get active() { return active; },
    speak
  };
})();
