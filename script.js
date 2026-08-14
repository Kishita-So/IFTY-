let currentUser = null;
let folders = [];
let chatSessions = []; 
let currentSessionId = null;
let currentView = "vocab"; 
let selectedImageBase64 = null;

const WORKER_URL = "https://ifty.humbleflail205.workers.dev";

function getStorageKey(email) {
  return "user_data_grok_v3_" + email.toLowerCase().trim();
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

window.toggleViewMode = function() {
  const vocabPage = document.getElementById("vocabPage");
  const aiChatPage = document.getElementById("aiChatPage");
  const btn = document.getElementById("floatingAiBtn");

  if (currentView === "vocab") {
    currentView = "chat";
    vocabPage.style.display = "none";
    aiChatPage.style.display = "flex";
    btn.innerText = "📚"; 
  } else {
    currentView = "vocab";
    vocabPage.style.display = "block";
    aiChatPage.style.display = "none";
    btn.innerText = "💬"; 
  }
  render();
};

window.createNewChatSession = function(shouldRender = true) {
  const newSession = {
    id: Date.now(),
    title: "新しいチャット " + (chatSessions.length + 1),
    messages: [{ role: "ai", text: "こんにちは！AIアシスタントです。単語の追加や質問ができます。" }]
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

window.updateChatTitle = function(newTitle) {
  const session = chatSessions.find(s => s.id === currentSessionId);
  if (session && newTitle.trim()) {
    session.title = newTitle.trim();
    saveUserData();
    renderChatArea();
  }
};

window.moveChatSession = function(direction) {
  const idx = chatSessions.findIndex(s => s.id === currentSessionId);
  if (idx === -1) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= chatSessions.length) return;

  const temp = chatSessions[idx];
  chatSessions[idx] = chatSessions[targetIdx];
  chatSessions[targetIdx] = temp;
  saveUserData();
  renderChatArea();
};

window.deleteCurrentChatSession = function() {
  if (chatSessions.length <= 1) {
    alert("最後のチャットは削除できません。");
    return;
  }
  if (confirm("このチャットを削除しますか？")) {
    chatSessions = chatSessions.filter(s => s.id !== currentSessionId);
    currentSessionId = chatSessions[0].id;
    saveUserData();
    renderChatArea();
  }
};

window.updateMessageText = function(msgIndex, newText) {
  const session = chatSessions.find(s => s.id === currentSessionId);
  if (session && session.messages[msgIndex]) {
    session.messages[msgIndex].text = newText;
    saveUserData();
  }
};

window.copyMessageText = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert("コピーしました！");
  });
};

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

// 🔊 音声読み上げ機能（発音・英文）
window.speakText = function(text, lang = 'en-US') {
  if (!('speechSynthesis' in window)) {
    alert("お使いのブラウザは音声読み上げに対応していません。");
    return;
  }
  window.speechSynthesis.cancel(); // 連続クリック時の重複防止
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9; // 少し聞き取りやすい速度
  window.speechSynthesis.speak(utterance);
};

// AIチャット送信処理
window.sendChatMessage = async function() {
  const inputEl = document.getElementById("chatInput");
  const text = inputEl ? inputEl.value.trim() : "";
  if (!text && !selectedImageBase64) return;

  const session = chatSessions.find(s => s.id === currentSessionId);
  if (!session) return;

  session.messages.push({ role: "user", text: text, image: selectedImageBase64 });
  inputEl.value = "";
  const currentImg = selectedImageBase64;
  clearSelectedImage();
  renderChatArea();

  session.messages.push({ role: "ai", text: "🤖 AIが処理中..." });
  renderChatArea();

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "agent_chat",
        prompt: text,
        image: currentImg,
        currentFolders: folders
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.updatedFolders) {
        folders = data.updatedFolders;
        saveUserData();
      }
      session.messages[session.messages.length - 1].text = data.reply || "完了しました。";
    } else {
      session.messages[session.messages.length - 1].text = "⚠️ サーバー応答エラー（ステータス: " + res.status + "）";
    }
  } catch(e) {
    session.messages[session.messages.length - 1].text = "⚠️ 通信エラー: " + e.message;
  }

  saveUserData();
  render();
};

// 単語の個別追加 ＆ 意味・例文の自動取得＋0.5秒後の自動発音
window.addWordToFolder = async function(folderId, word) {
  const clean = word.trim();
  if (!clean) return;

  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;

  let aiData = { meanings: [`【訳】 ${clean}`], examples: [], details: "" };
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "word", word: clean })
    });
    if (res.ok) {
      const data = await res.json();
      aiData = { 
        meanings: data.meanings || aiData.meanings, 
        examples: data.examples || [], 
        details: data.details || "" 
      };
    }
  } catch(e) {}

  if (!folder.words) folder.words = [];
  folder.words.push({ word: clean, ...aiData });
  saveUserData();
  render();

  // ⏱️ 追加完了から0.5秒後に自動で発音
  setTimeout(() => {
    speakText(clean, 'en-US');
  }, 500);
};

window.deleteWord = function(folderId, wIdx) {
  const folder = folders.find(f => f.id === folderId);
  if (folder && folder.words) {
    folder.words.splice(wIdx, 1);
    saveUserData();
    render();
  }
};

window.deleteFolder = function(folderId) {
  if (confirm("フォルダを削除しますか？")) {
    folders = folders.filter(f => f.id !== folderId);
    saveUserData();
    render();
  }
};

window.addExample = function(folderId, wIdx) {
  const folder = folders.find(f => f.id === folderId);
  if (folder && folder.words[wIdx]) {
    if (!folder.words[wIdx].examples) folder.words[wIdx].examples = [];
    folder.words[wIdx].examples.push({ en: "Example sentence.", ja: "例文の訳" });
    saveUserData();
    render();
  }
};

window.updateWordField = function(folderId, wIdx, field, val) {
  const folder = folders.find(f => f.id === folderId);
  if (folder && folder.words[wIdx]) {
    folder.words[wIdx][field] = val;
    saveUserData();
  }
};

window.updateExampleField = function(folderId, wIdx, eIdx, field, val) {
  const folder = folders.find(f => f.id === folderId);
  if (folder && folder.words[wIdx] && folder.words[wIdx].examples[eIdx]) {
    folder.words[wIdx].examples[eIdx][field] = val;
    saveUserData();
  }
};

window.deleteExample = function(folderId, wIdx, eIdx) {
  const folder = folders.find(f => f.id === folderId);
  if (folder && folder.words[wIdx] && folder.words[wIdx].examples) {
    folder.words[wIdx].examples.splice(eIdx, 1);
    saveUserData();
    render();
  }
};

window.moveWord = function(folderId, wIdx, direction) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder || !folder.words) return;
  const targetIdx = wIdx + Number(direction);
  if (targetIdx < 0 || targetIdx >= folder.words.length) return;
  const temp = folder.words[wIdx];
  folder.words[wIdx] = folder.words[targetIdx];
  folder.words[targetIdx] = temp;
  saveUserData();
  render();
};

window.moveWordToFolder = function(fromFolderId, wIdx, toFolderIdStr) {
  if (!toFolderIdStr) return;
  const toFolderId = Number(toFolderIdStr);
  const fromFolder = folders.find(f => f.id === fromFolderId);
  const toFolder = folders.find(f => f.id === toFolderId);
  if (!fromFolder || !toFolder) return;

  const [wordObj] = fromFolder.words.splice(wIdx, 1);
  if (!toFolder.words) toFolder.words = [];
  toFolder.words.push(wordObj);
  saveUserData();
  render();
};

window.formatWordText = function(folderId, wIdx, color) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const selectedText = range.toString();
  if (!selectedText) return;

  let styledHtml = selectedText;
  if (color === 'red') styledHtml = `<span style="color: red; font-weight: bold;">${selectedText}</span>`;
  if (color === 'blue') styledHtml = `<span style="color: blue; font-weight: bold;">${selectedText}</span>`;
  if (color === 'yellow') styledHtml = `<span style="background-color: #fef08a; padding: 0 2px;">${selectedText}</span>`;
  if (color === 'bold') styledHtml = `<b>${selectedText}</b>`;

  const span = document.createElement('span');
  span.innerHTML = styledHtml;
  range.deleteContents();
  range.insertNode(span);

  const editableDiv = document.getElementById(`meaning_${folderId}_${wIdx}`);
  if (editableDiv) {
    const meaningsArray = Array.from(editableDiv.children).map(child => child.outerHTML).join("<br>") || editableDiv.innerHTML;
    updateWordField(folderId, wIdx, 'meanings', [meaningsArray]);
  }
};

function renderChatArea() {
  const selectEl = document.getElementById("chatSessionSelect");
  const titleInput = document.getElementById("chatTitleInput");
  const session = chatSessions.find(s => s.id === currentSessionId);
  if (!session) return;

  if (selectEl) {
    selectEl.innerHTML = chatSessions.map(s => 
      `<option value="${s.id}" ${s.id === currentSessionId ? 'selected' : ''}>${s.title}</option>`
    ).join('');
  }
  if (titleInput && document.activeElement !== titleInput) {
    titleInput.value = session.title;
  }

  const msgsEl = document.getElementById("chatMessages");
  if (!msgsEl) return;

  msgsEl.innerHTML = session.messages.map((m, mIdx) => `
    <div style="align-self: ${m.role === 'user' ? 'flex-end' : 'flex-start'}; max-width: 85%; background: ${m.role === 'user' ? '#e0f2fe' : '#ffffff'}; color: #0f172a; padding: 10px 14px; border-radius: 12px; border: 1px solid #cbd5e1; font-size: 0.9em; position: relative;">
      ${m.image ? `<img src="${m.image}" style="max-width: 100%; border-radius: 6px; margin-bottom: 6px;"><br>` : ''}
      <div contenteditable="true" onblur="updateMessageText(${mIdx}, this.innerText)" style="outline: none; white-space: pre-wrap; margin-bottom: 4px;">${m.text}</div>
      <div style="display: flex; justify-content: flex-end; gap: 4px; margin-top: 4px; border-top: 1px solid #f1f5f9; padding-top: 4px;">
        <button onclick='copyMessageText(${JSON.stringify(m.text)})' style="background: none; border: none; cursor: pointer; font-size: 0.75em; color: #64748b;">📋 コピー</button>
      </div>
    </div>
  `).join('');
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

function render() {
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
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h3 style="margin:0;">📁 ${f.name} (${f.words ? f.words.length : 0}語)</h3>
        <button onclick="deleteFolder(${f.id})" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; cursor: pointer;">削除</button>
      </div>

      <div style="display: flex; gap: 6px; margin-bottom: 14px;">
        <input placeholder="単語を入力してEnter" onkeydown="if(event.key==='Enter'){ addWordToFolder(${f.id}, this.value); this.value=''; }" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.95em;">
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${(f.words || []).map((w, wIdx) => `
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <b style="font-size: 1.1em; color: #0f172a;">${w.word}</b>
                <button onclick="speakText('${w.word}', 'en-US')" style="background: #e2e8f0; border: none; border-radius: 4px; padding: 2px 6px; font-size: 0.8em; cursor: pointer;" title="発音を聞く">🔊</button>
              </div>
              <div style="display: flex; gap: 4px; align-items: center;">
                <button onclick="moveWord(${f.id}, ${wIdx}, -1)" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:2px 6px; border-radius:4px; cursor:pointer;">▲</button>
                <button onclick="moveWord(${f.id}, ${wIdx}, 1)" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:2px 6px; border-radius:4px; cursor:pointer;">▼</button>
                <select onchange="moveWordToFolder(${f.id}, ${wIdx}, this.value)" style="padding:2px; font-size:0.8em; border-radius:4px;">
                  <option value="">移動...</option>
                  ${folders.map(ot => `<option value="${ot.id}">${ot.name}</option>`).join('')}
                </select>
                <button onclick="deleteWord(${f.id}, ${wIdx})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 1.1em;">🗑️</button>
              </div>
            </div>

            <div style="display: flex; gap: 4px; margin-bottom: 4px; font-size: 0.75em; align-items: center;">
              <span style="color:#64748b;">装飾:</span>
              <button onclick="formatWordText(${f.id}, ${wIdx}, 'red')" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; border-radius:3px; padding:1px 6px; cursor:pointer;">赤字</button>
              <button onclick="formatWordText(${f.id}, ${wIdx}, 'blue')" style="background:#dbeafe; color:#1d4ed8; border:1px solid #93c5fd; border-radius:3px; padding:1px 6px; cursor:pointer;">青字</button>
              <button onclick="formatWordText(${f.id}, ${wIdx}, 'yellow')" style="background:#fef08a; color:#854d0e; border:1px solid #fde047; border-radius:3px; padding:1px 6px; cursor:pointer;">黄ハイライト</button>
              <button onclick="formatWordText(${f.id}, ${wIdx}, 'bold')" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:3px; padding:1px 6px; cursor:pointer;">B</button>
            </div>
            
            <div id="meaning_${f.id}_${wIdx}" style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 0.9em; margin-bottom: 8px; line-height: 1.5;" contenteditable="true" onblur="updateWordField(${f.id}, ${wIdx}, 'meanings', [this.innerHTML])">
              ${Array.isArray(w.meanings) ? w.meanings.join("<br>") : (w.meanings || '')}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; margin-bottom: 4px;">
              <span style="font-size: 0.85em; color: #64748b;">例文</span>
              <button onclick="addExample(${f.id}, ${wIdx})" style="background: #0284c7; color: white; border: none; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; cursor: pointer;">＋ 例文追加</button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${(w.examples || []).map((ex, eIdx) => `
                <div style="background: #ffffff; padding: 6px; border-radius: 4px; border: 1px solid #e2e8f0; font-size: 0.85em; position: relative;">
                  <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                    <div contenteditable="true" onblur="updateExampleField(${f.id}, ${wIdx}, ${eIdx}, 'en', this.innerText)" style="color: #2563eb; outline: none; flex: 1;">${ex.en}</div>
                    <button onclick="speakText('${ex.en.replace(/'/g, "\\'")}', 'en-US')" style="background: #f1f5f9; border: none; border-radius: 4px; padding: 2px 5px; font-size: 0.75em; cursor: pointer;" title="英文を読み上げる">🔊</button>
                  </div>
                  <div contenteditable="true" onblur="updateExampleField(${f.id}, ${wIdx}, ${eIdx}, 'ja', this.innerText)" style="color: #475569; outline: none;">${ex.ja}</div>
                  <button onclick="deleteExample(${f.id}, ${wIdx}, ${eIdx})" style="position: absolute; top: 4px; right: 4px; background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.8em;">🗑️</button>
                </div>
              `).join('')}
            </div>

          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

window.loginWithAccount = function(email) {
  currentUser = { email: email };
  loadUserData(email);
  render();
};
window.logout = function() { location.reload(); };

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
    `<div onclick="loginWithAccount('${a}')" style="padding:12px; background:#334155; border-radius:8px; cursor:pointer; color:white; font-weight:500; text-align:center;">${a}</div>`
  ).join('');
};
