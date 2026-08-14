let currentUser = null;
let folders = [];
let chatSessions = []; 
let currentSessionId = null;
let currentView = "vocab"; 
let selectedImageBase64 = null;

const WORKER_URL = "https://ifty.humbleflail205.workers.dev";

function getStorageKey(email) {
  return "user_data_grok_v13_" + email.toLowerCase().trim();
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
    if (btn) btn.innerText = "📚"; 
  } else {
    currentView = "vocab";
    vocabPage.style.display = "block";
    aiChatPage.style.display = "none";
    if (btn) btn.innerText = "💬"; 
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

window.speakText = function(text, lang = 'en-US', delay = 0) {
  if (!('speechSynthesis' in window)) return;
  setTimeout(() => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }, delay);
};

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
        meanings: Array.isArray(data.meanings) ? data.meanings : [data.meanings || ''], 
        examples: data.examples || [], 
        details: data.details || "" 
      };
    }
  } catch(e) {}

  if (!folder.words) folder.words = [];
  folder.words.push({ word: clean, checked: false, ...aiData });
  saveUserData();
  render();

  speakText(clean, 'en-US', 500);
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

window.toggleWordCheck = function(folderId, wIdx, isChecked) {
  const folder = folders.find(f => f.id === folderId);
  if (folder && folder.words[wIdx]) {
    folder.words[wIdx].checked = isChecked;
    saveUserData();
  }
};

window.toggleFolderCheck = function(folderId, isChecked) {
  const folder = folders.find(f => f.id === folderId);
  if (folder && folder.words) {
    folder.checked = isChecked;
    folder.words.forEach(w => w.checked = isChecked);
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

window.updateWordMeanings = function(folderId, wIdx, rawText) {
  const folder = folders.find(f => f.id === folderId);
  if (folder && folder.words[wIdx]) {
    const cleaned = rawText.replace(/<[^>]*>?/gm, '');
    folder.words[wIdx].meanings = cleaned.split('\n').map(line => line.trim()).filter(Boolean);
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

// --- フラッシュカード機能（ランダム・定着/未定着・2周目対応） ---
let flashcardList = [];
let currentFlashcardIndex = 0;
let isCardFlipped = false;
let currentFlashcardMode = 'all';
let isRandomMode = false;

window.openMenuModal = function() {
  let modal = document.getElementById("appMenuModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "appMenuModal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10000;";
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">メニュー</h3>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="font-size: 0.9em; font-weight: bold; color: #475569; text-align: left;">📇 フラッシュカード範囲</div>
        <button onclick="startFlashcards('all', false)" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">全単語 (順番通り)</button>
        <button onclick="startFlashcards('all', true)" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">全単語 (ランダム)</button>
        <button onclick="startFlashcards('checked_folders', true)" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">チェックしたフォルダ (ランダム可)</button>
        <button onclick="startFlashcards('checked_words', true)" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">チェックした単語 (ランダム可)</button>
        <button onclick="closeMenuModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 8px;">閉じる</button>
      </div>
    </div>
  `;
  modal.style.display = "flex";
};

window.closeMenuModal = function() {
  const modal = document.getElementById("appMenuModal");
  if (modal) modal.style.display = "none";
};

window.startFlashcards = function(mode, random = false) {
  closeMenuModal();
  currentFlashcardMode = mode;
  isRandomMode = random;
  loadFlashcardItems(mode, random);

  if (flashcardList.length === 0) {
    alert("対象となる単語がありません。チェックを入れるか、単語を追加してください。");
    return;
  }

  currentFlashcardIndex = 0;
  isCardFlipped = false;
  renderFlashcardModal();
};

function loadFlashcardItems(mode, random) {
  let list = [];
  if (mode === 'all') {
    folders.forEach(f => {
      if (f.words) f.words.forEach(w => list.push({ ...w, mastery: w.mastery || 'unfixed' }));
    });
  } else if (mode === 'checked_folders') {
    folders.forEach(f => {
      if (f.checked && f.words) f.words.forEach(w => list.push({ ...w, mastery: w.mastery || 'unfixed' }));
    });
  } else if (mode === 'checked_words') {
    folders.forEach(f => {
      if (f.words) {
        f.words.forEach(w => {
          if (w.checked) list.push({ ...w, mastery: w.mastery || 'unfixed' });
        });
      }
    });
  } else if (mode === 'unfixed_only') {
    // 未定着の語だけ
    if (window._lastUnfixedList && window._lastUnfixedList.length > 0) {
      list = window._lastUnfixedList;
    }
  }

  if (random) {
    // Fisher-Yates shuffle
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  flashcardList = list;
}

window.renderFlashcardModal = function() {
  let modal = document.getElementById("flashcardModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "flashcardModal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;";
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }

  // 全カード終了時の処理
  if (currentFlashcardIndex >= flashcardList.length) {
    const unfixedItems = flashcardList.filter(w => w.mastery === 'unfixed');
    window._lastUnfixedList = unfixedItems;

    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
        <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 10px;">🎉 お疲れ様でした！</h3>
        <p style="color: #475569; font-size: 0.95em; margin-bottom: 20px;">すべてのフラッシュカードが終了しました。</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${unfixedItems.length > 0 ? `<button onclick="startFlashcards('unfixed_only', ${isRandomMode})" style="padding: 10px; background: #e11d48; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">❌ 未定着の語だけで2周目 (${unfixedItems.length}語)</button>` : '<p style="color: #16a34a; font-weight: bold;">すべて定着しました！素晴らしい！</p>'}
          <button onclick="startFlashcards('${currentFlashcardMode}', ${isRandomMode})" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">🔄 同じ条件でもう一度</button>
          <button onclick="closeFlashcardModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 6px;">終了する</button>
        </div>
      </div>
    `;
    return;
  }

  const currentWord = flashcardList[currentFlashcardIndex];
  const meaningsText = Array.isArray(currentWord.meanings) ? currentWord.meanings.join("<br>") : (currentWord.meanings || '');

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); text-align: center; position: relative;">
      <div style="position: absolute; top: 12px; left: 16px; font-size: 0.85em; color: #64748b;">${currentFlashcardIndex + 1} / ${flashcardList.length}</div>
      <button onclick="closeFlashcardModal()" style="position: absolute; top: 10px; right: 12px; background: none; border: none; font-size: 1.2em; cursor: pointer; color: #64748b;">✕</button>
      
      <div onclick="toggleCardFlip()" style="margin: 30px 0 20px 0; padding: 25px 20px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; cursor: pointer; min-height: 110px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
        <div style="font-size: 1.6em; font-weight: bold; color: #0f172a; margin-bottom: 8px;">${currentWord.word}</div>
        <button onclick="event.stopPropagation(); speakText('${currentWord.word}', 'en-US', 100)" style="background: #e2e8f0; border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.85em; cursor: pointer; margin-bottom: 8px;">🔊 発音</button>
        <div style="font-size: 1.05em; color: #334155; line-height: 1.5; display: ${isCardFlipped ? 'block' : 'none'}; border-top: 1px solid #e2e8f0; padding-top: 8px; width: 100%; text-align: left;">${meaningsText}</div>
        <div style="font-size: 0.8em; color: #94a3b8; margin-top: 8px;">${isCardFlipped ? '(クリックで隠す)' : '(クリックして意味を表示)'}</div>
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 12px;">
        <button onclick="setMasteryAndNext('unfixed')" style="flex: 1; padding: 10px; background: #f43f5e; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9em;">❌ 未定着</button>
        <button onclick="setMasteryAndNext('fixed')" style="flex: 1; padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9em;">⭕ 定着</button>
      </div>

      <div style="display: flex; justify-content: space-between; gap: 10px;">
        <button onclick="prevFlashcard()" style="flex: 1; padding: 8px; background: #64748b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85em;" ${currentFlashcardIndex === 0 ? 'opacity: 0.5; cursor: not-allowed;' : ''}>◀ 前へ</button>
        <button onclick="nextFlashcard()" style="flex: 1; padding: 8px; background: #94a3b8; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85em;" ${currentFlashcardIndex === flashcardList.length - 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}>スキップ ▶</button>
      </div>
    </div>
  `;
};

window.toggleCardFlip = function() {
  isCardFlipped = !isCardFlipped;
  renderFlashcardModal();
};

window.setMasteryAndNext = function(status) {
  if (flashcardList[currentFlashcardIndex]) {
    flashcardList[currentFlashcardIndex].mastery = status;
  }
  currentFlashcardIndex++;
  isCardFlipped = false;
  renderFlashcardModal();
};

window.prevFlashcard = function() {
  if (currentFlashcardIndex > 0) {
    currentFlashcardIndex--;
    isCardFlipped = false;
    renderFlashcardModal();
  }
};

window.nextFlashcard = function() {
  if (currentFlashcardIndex < flashcardList.length - 1) {
    currentFlashcardIndex++;
    isCardFlipped = false;
    renderFlashcardModal();
  }
};

window.closeFlashcardModal = function() {
  const modal = document.getElementById("flashcardModal");
  if (modal) modal.style.display = "none";
};

// --- フローティングボタン管理（メニュー ＆ AIチャットボタン） ---
function ensureFloatingButtons() {
  let container = document.getElementById("floatingButtonsContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "floatingButtonsContainer";
    container.style.cssText = "position: fixed; bottom: 20px; right: 20px; display: flex; flex-direction: column; gap: 10px; z-index: 9999;";
    document.body.appendChild(container);
  }

  let aiBtn = document.getElementById("floatingAiBtn");
  if (!aiBtn) {
    aiBtn = document.createElement("button");
    aiBtn.id = "floatingAiBtn";
    aiBtn.innerText = currentView === "vocab" ? "💬" : "📚";
    aiBtn.onclick = toggleViewMode;
    aiBtn.style.cssText = "width: 50px; height: 50px; border-radius: 50%; background: #0284c7; color: white; border: none; font-size: 20px; cursor: pointer; box-shadow: 0 4px 8px rgba(0,0,0,0.3); display: flex; justify-content: center; align-items: center;";
  } else {
    aiBtn.innerText = currentView === "vocab" ? "💬" : "📚";
  }

  let menuBtn = document.getElementById("floatingMenuBtn");
  if (!menuBtn) {
    menuBtn = document.createElement("button");
    menuBtn.id = "floatingMenuBtn";
    menuBtn.innerText = "≡";
    menuBtn.onclick = openMenuModal;
    menuBtn.style.cssText = "width: 50px; height: 50px; border-radius: 50%; background: #0f172a; color: white; border: none; font-size: 22px; cursor: pointer; box-shadow: 0 4px 8px rgba(0,0,0,0.3); display: flex; justify-content: center; align-items: center;";
  }

  container.innerHTML = "";
  if (currentUser) {
    container.appendChild(menuBtn);
    container.appendChild(aiBtn);
  }
}

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
  const landingPage = document.getElementById("landingPage");
  const mainPortal = document.getElementById("mainPortal");
  const userDisplay = document.getElementById("userDisplay");

  ensureFloatingButtons();

  if (currentUser) {
    if (landingPage) landingPage.style.display = "none";
    if (mainPortal) mainPortal.style.display = "block";
    if (userDisplay) userDisplay.innerText = currentUser.email;
  } else {
    if (landingPage) landingPage.style.display = "block";
    if (mainPortal) mainPortal.style.display = "none";
    
    setupLoginUI();
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

  foldersEl.innerHTML = folders.map(f => {
    const isFolderChecked = f.checked === true;
    return `
    <div style="background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" ${isFolderChecked ? 'checked' : ''} onchange="toggleFolderCheck(${f.id}, this.checked)" style="width: 18px; height: 18px; cursor: pointer;" title="フォルダ全体を選択/解除">
          <h3 style="margin:0;">📁 ${f.name} (${f.words ? f.words.length : 0}語)</h3>
        </div>
        <button onclick="deleteFolder(${f.id})" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; cursor: pointer;">削除</button>
      </div>

      <div style="display: flex; gap: 6px; margin-bottom: 14px;">
        <input placeholder="単語を入力してEnter" onkeydown="if(event.key==='Enter'){ addWordToFolder(${f.id}, this.value); this.value=''; }" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.95em;">
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${(f.words || []).map((w, wIdx) => {
          const rawMeanings = Array.isArray(w.meanings) ? w.meanings.join("\n") : (w.meanings || '');
          const safeMeaningsText = rawMeanings.replace(/<[^>]*>?/gm, '');
          const isWordChecked = w.checked === true;

          return `
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" ${isWordChecked ? 'checked' : ''} onchange="toggleWordCheck(${f.id}, ${wIdx}, this.checked)" style="width: 16px; height: 16px; cursor: pointer;" title="単語を選択/解除">
                <b style="font-size: 1.1em; color: #0f172a;">${w.word}</b>
                <button onclick="speakText('${w.word}', 'en-US', 500)" style="background: #e2e8f0; border: none; border-radius: 4px; padding: 2px 6px; font-size: 0.8em; cursor: pointer;" title="発音を聞く">🔊</button>
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
            
            <div id="meaning_${f.id}_${wIdx}" style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 0.9em; margin-bottom: 8px; line-height: 1.5; outline: none;" contenteditable="true" onblur="updateWordMeanings(${f.id}, ${wIdx}, this.innerText)">${safeMeaningsText}</div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; margin-bottom: 4px;">
              <span style="font-size: 0.85em; color: #64748b;">例文</span>
              <button onclick="addExample(${f.id}, ${wIdx})" style="background: #0284c7; color: white; border: none; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; cursor: pointer;">＋ 例文追加</button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${(w.examples || []).map((ex, eIdx) => `
                <div style="background: #ffffff; padding: 6px 28px 6px 6px; border-radius: 4px; border: 1px solid #e2e8f0; font-size: 0.85em; position: relative;">
                  <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                    <div contenteditable="true" onblur="updateExampleField(${f.id}, ${wIdx}, ${eIdx}, 'en', this.innerText)" style="color: #2563eb; outline: none; flex: 1;">${ex.en}</div>
                    <button onclick="speakText('${ex.en.replace(/'/g, "\\'")}', 'en-US', 500)" style="background: #f1f5f9; border: none; border-radius: 4px; padding: 2px 5px; font-size: 0.75em; cursor: pointer;" title="英文を読み上げる">🔊</button>
                  </div>
                  <div contenteditable="true" onblur="updateExampleField(${f.id}, ${wIdx}, ${eIdx}, 'ja', this.innerText)" style="color: #475569; outline: none;">${ex.ja}</div>
                  <button onclick="deleteExample(${f.id}, ${wIdx}, ${eIdx})" style="position: absolute; top: 6px; right: 6px; background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.9em; padding: 4px;" title="例文を削除">🗑️</button>
                </div>
              `).join('')}
            </div>

          </div>
        `;}).join('')}
      </div>
    </div>
  `;}).join('');
}

window.loginWithAccount = function(email) {
  const cleanEmail = email ? email.trim() : "";
  if (!cleanEmail) {
    alert("有効なメールアドレスを入力してください。");
    return;
  }
  currentUser = { email: cleanEmail };
  localStorage.setItem("last_logged_in_email", cleanEmail);
  loadUserData(cleanEmail);
  render();
};

window.logout = function() { 
  localStorage.removeItem("last_logged_in_email");
  location.reload(); 
};

window.createFolder = function() {
  const el = document.getElementById("folderName");
  if (el && el.value.trim()) {
    folders.push({ id: Date.now(), name: el.value.trim(), words: [], checked: false });
    el.value = ""; saveUserData(); render();
  }
};

function setupLoginUI() {
  const landingPage = document.getElementById("landingPage");
  if (!landingPage) return;

  landingPage.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; min-height: 80vh; padding: 20px;">
      <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; width: 100%; max-width: 380px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); text-align: center;">
        <h2 style="color: #38bdf8; margin-top: 0; margin-bottom: 8px; font-size: 1.4em;">単語帳アプリ</h2>
        <p style="color: #94a3b8; font-size: 0.9em; margin-bottom: 20px;">メールアドレスを入力してログインしてください</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <input type="email" id="customEmailInput" placeholder="your_email@example.com" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: white; font-size: 0.95em; box-sizing: border-box;" onkeydown="if(event.key==='Enter'){ loginWithAccount(document.getElementById('customEmailInput').value); }">
          <button onclick="loginWithAccount(document.getElementById('customEmailInput').value)" style="background: #0284c7; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.95em; width: 100%;">ログイン</button>
        </div>
      </div>
    </div>
  `;
}

window.onload = function() {
  const lastEmail = localStorage.getItem("last_logged_in_email");
  if (lastEmail) {
    loginWithAccount(lastEmail);
    return;
  }
  setupLoginUI();
};
