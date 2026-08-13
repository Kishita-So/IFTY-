// --- 🔐 グローバル状態 ---
let currentUser = null;
let folders = [];
let chatSessions = []; // ChatGPT風の履歴管理 [{ id, title, messages: [{role, text}] }]
let currentSessionId = null;
let currentView = "vocab"; // "vocab" または "chat"
let selectedImageBase64 = null;

const WORKER_URL = "https://ifty.humbleflail205.workers.dev";

// --- データ読み書き ---
function getStorageKey(email) {
  return "user_data_v2_" + email.toLowerCase().trim();
}

function saveUserData() {
  if (!currentUser) return;
  const payload = {
    folders: folders,
    chatSessions: chatSessions,
    currentSessionId: currentSessionId
  };
  localStorage.setItem(getStorageKey(currentUser.email), JSON.stringify(payload));
}

function loadUserData(email) {
  const saved = localStorage.getItem(getStorageKey(email));
  if (saved) {
    try {
      const data = JSON.parse(saved);
      folders = data.folders || [];
      chatSessions = data.chatSessions || [];
      currentSessionId = data.currentSessionId || null;
    } catch(e) {
      folders = []; chatSessions = [];
    }
  } else {
    folders = []; chatSessions = [];
  }
  
  if (chatSessions.length === 0) {
    createNewChatSession(false);
  } else if (!currentSessionId) {
    currentSessionId = chatSessions[0].id;
  }
}

// --- 画面切り替え（右下ボタン） ---
window.toggleViewMode = function() {
  const vocabPage = document.getElementById("vocabPage");
  const aiChatPage = document.getElementById("aiChatPage");
  const btn = document.getElementById("floatingAiBtn");

  if (currentView === "vocab") {
    currentView = "chat";
    vocabPage.style.display = "none";
    aiChatPage.style.display = "flex";
    btn.innerText = "📚"; // 単語帳に戻るアイコン
  } else {
    currentView = "vocab";
    vocabPage.style.display = "block";
    aiChatPage.style.display = "none";
    btn.innerText = "💬"; // チャットを開くアイコン
  }
  render();
};

// --- ChatGPT風 チャット管理 ---
window.createNewChatSession = function(shouldRender = true) {
  const newSession = {
    id: Date.now(),
    title: "新しいチャット " + (chatSessions.length + 1),
    messages: [{ role: "ai", text: "こんにちは！単語についての質問や、「〇〇の単語を単語帳に追加して」といった指示、写真の読み込みなどができます。" }]
  };
  chatSessions.unshift(newSession);
  currentSessionId = newSession.id;
  saveUserData();
  if (shouldRender) render();
};

window.switchChatSession = function(id) {
  currentSessionId = Number(id);
  saveUserData();
  renderChatArea();
};

// --- 画像選択処理 ---
window.handleImageSelect = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    selectedImageBase64 = e.target.result;
    document.getElementById("imagePreview").src = selectedImageBase64;
    document.getElementById("imagePreviewContainer").style.display = "flex";
  };
  reader.readAsDataURL(file);
};

window.clearSelectedImage = function() {
  selectedImageBase64 = null;
  document.getElementById("imageInput").value = "";
  document.getElementById("imagePreviewContainer").style.display = "none";
};

// --- AIへの送信 & 単語帳の自動編集命令レスポンス ---
window.sendChatMessage = async function() {
  const inputEl = document.getElementById("chatInput");
  const text = inputEl ? inputEl.value.trim() : "";
  if (!text && !selectedImageBase64) return;

  const session = chatSessions.find(s => s.id === currentSessionId);
  if (!session) return;

  // ユーザーメッセージの追加
  const userMsg = { role: "user", text: text, image: selectedImageBase64 };
  session.messages.push(userMsg);

  // タイトル更新（初回の発言時）
  if (session.messages.length === 2) {
    session.title = text.substring(0, 12) || "画像付き質問";
  }

  inputEl.value = "";
  const currentImg = selectedImageBase64;
  clearSelectedImage();
  renderChatArea();

  // AIレスポンス生成中の表示
  session.messages.push({ role: "ai", text: "🤖 考え中..." });
  renderChatArea();

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "agent_chat",
        prompt: text,
        image: currentImg,
        currentFolders: folders // 現在の単語帳構造を送信して編集を行わせる
      })
    });

    if (res.ok) {
      const data = await res.json();
      
      // 1. AIが単語帳データの自動編集を行なった場合
      if (data.updatedFolders) {
        folders = data.updatedFolders;
        saveUserData();
      }

      // 2. 返答メッセージのセット
      session.messages[session.messages.length - 1].text = data.reply || "処理が完了しました。";
    } else {
      session.messages[session.messages.length - 1].text = "⚠️ 応答の取得に失敗しました。";
    }
  } catch(e) {
    session.messages[session.messages.length - 1].text = "⚠️ エラーが発生しました。";
  }

  saveUserData();
  render();
};

// --- レンダリング処理 ---
function renderChatArea() {
  const selectEl = document.getElementById("chatSessionSelect");
  if (selectEl) {
    selectEl.innerHTML = chatSessions.map(s => 
      `<option value="${s.id}" ${s.id === currentSessionId ? 'selected' : ''}>${s.title}</option>`
    ).join('');
  }

  const msgsEl = document.getElementById("chatMessages");
  if (!msgsEl) return;

  const session = chatSessions.find(s => s.id === currentSessionId);
  if (!session) return;

  msgsEl.innerHTML = session.messages.map(m => `
    <div style="align-self: ${m.role === 'user' ? 'flex-end' : 'flex-start'}; max-width: 80%; background: ${m.role === 'user' ? '#0284c7' : '#ffffff'}; color: ${m.role === 'user' ? '#white' : '#0f172a'}; padding: 10px 14px; border-radius: 12px; border: ${m.role === 'user' ? 'none' : '1px solid #cbd5e1'}; font-size: 0.9em; white-space: pre-wrap;">
      ${m.image ? `<img src="${m.image}" style="max-width: 100%; border-radius: 6px; margin-bottom: 6px;"><br>` : ''}
      ${m.text}
    </div>
  `).join('');

  msgsEl.scrollTop = msgsEl.scrollHeight;
}

function render() {
  // アカウント画面・ボタンの可視性
  if (currentUser) {
    document.getElementById("landingPage").style.display = "none";
    document.getElementById("mainPortal").style.display = "block";
    document.getElementById("floatingAiBtn").style.display = "flex";
    document.getElementById("userDisplay").innerText = currentUser.email;
  } else {
    document.getElementById("landingPage").style.display = "block";
    document.getElementById("mainPortal").style.display = "none";
    document.getElementById("floatingAiBtn").style.display = "none";
    return;
  }

  if (currentView === "chat") {
    renderChatArea();
  } else {
    renderFolders();
  }
}

function renderFolders() {
  const foldersEl = document.getElementById("folders");
  if (!foldersEl) return;
  foldersEl.innerHTML = folders.map(f => `
    <div style="background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
      <h3 style="margin:0 0 8px 0;">📁 ${f.name} (${f.words ? f.words.length : 0}語)</h3>
      <div>${(f.words || []).map(w => `<span style="display:inline-block; background:#f1f5f9; padding:4px 8px; border-radius:4px; margin:2px; font-size:0.85em;"><b>${w.word}</b>: ${w.meanings ? w.meanings[0] : ''}</span>`).join('')}</div>
    </div>
  `).join('');
}

// 認証・フォルダ等の初期化処理
window.loginWithAccount = function(email) {
  currentUser = { email: email };
  loadUserData(email);
  render();
};
window.logout = function() { location.reload(); };
window.showAuthModal = function() { document.getElementById("authModal").style.display = "flex"; };
window.hideAuthModal = function() { document.getElementById("authModal").style.display = "none"; };
window.handleAuthSubmit = function() {
  const email = document.getElementById("authEmail").value.trim();
  if (email) { window.loginWithAccount(email); hideAuthModal(); }
};
window.createFolder = function() {
  const el = document.getElementById("folderName");
  if (el && el.value.trim()) {
    folders.push({ id: Date.now(), name: el.value.trim(), words: [] });
    el.value = ""; saveUserData(); render();
  }
};
window.onload = function() {
  const accounts = ["16011264@kago.ed.jp", "humbleflail205@gmail.com"];
  document.getElementById("accountList").innerHTML = accounts.map(a => 
    `<div onclick="loginWithAccount('${a}')" style="padding:10px; background:#334155; border-radius:6px; cursor:pointer;">${a}</div>`
  ).join('');
};
