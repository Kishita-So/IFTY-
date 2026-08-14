let currentUser = null;
let folders = [];
let chatSessions = []; 
let currentSessionId = null;
let currentView = "vocab"; 
let selectedImageBase64 = null;

const WORKER_URL = "https://ifty.humbleflail205.workers.dev";

function getStorageKey(email) {
  return "user_data_grok_v10_" + email.toLowerCase().trim();
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

// 🎓 学習メニューの展開・閉じる切り替え
window.toggleStudyMenu = function() {
  let menu = document.getElementById("studyMenuPopup");
  if (!menu) {
    // メニューがまだ存在しない場合は動的に生成してDOMに追加
    menu = document.createElement("div");
    menu.id = "studyMenuPopup";
    menu.style.cssText = "position: fixed; bottom: 85px; right: 20px; background: white; border: 1px solid #cbd5e1; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 12px; display: flex; flex-direction: column; gap: 8px; z-index: 1000; min-width: 200px;";
    
    // フォルダのオプションを動的に作成
    const folderOptionsHtml = folders.map(f => `
      <div onclick="startFlashcards('folder', ${f.id})" style="padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em; color: #334155; background: #f8fafc;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f8fafc'">
        📁 ${f.name} のみ
      </div>
    `).join('');

    menu.innerHTML = `
      <div style="font-size: 0.85em; font-weight: bold; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 2px;">🎓 フラッシュカード開始</div>
      <div onclick="startFlashcards('all')" style="padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.9em; color: #0f172a; font-weight: 500;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
        📚 すべての単語から出題
      </div>
      <div onclick="startFlashcards('checked')" style="padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.9em; color: #0f172a; font-weight: 500;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
        ☑️ チェックした単語から出題
      </div>
      <div style="font-size: 0.85em; font-weight: bold; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6px; margin-top: 2px;">📁 フォルダ別</div>
      ${folderOptionsHtml.length > 0 ? folderOptionsHtml : '<div style="font-size: 0.8em; color: #94a3b8; padding: 4px;">フォルダがありません</div>'}
    `;
    document.body.appendChild(menu);
  } else {
    menu.style.display = menu.style.display === "none" ? "flex" : "none";
  }
};

// 🎓 フラッシュカードを開始する処理（モードに応じた単語の抽出）
window.startFlashcards = function(mode, targetId = null) {
  // メニューを非表示にする
  const menu = document.getElementById("studyMenuPopup");
  if (menu) menu.style.display = "none";

  let targetWords = [];

  if (mode === 'all') {
    folders.forEach(f => {
      if (f.words) targetWords.push(...f.words);
    });
  } else if (mode === 'checked') {
    folders.forEach(f => {
      if (f.words) {
        // フォルダ自体にチェックがあるか、または単語個別にチェックがあるもの
        const filtered = f.words.filter(w => w.checked === true);
        targetWords.push(...filtered);
      }
    });
  } else if (mode === 'folder') {
    const folder = folders.find(f => f.id === targetId);
    if (folder && folder.words) {
      targetWords = [...folder.words];
    }
  }

  if (targetWords.length === 0) {
    alert("出題対象となる単語が見つかりませんでした。（チェックがついているか確認してください）");
    return;
  }

  // ここにフラッシュカード画面を起動するロジックを繋げます
  alert(`フラッシュカードを開始します！ 対象単語数: ${targetWords.length}語`);
  console.log("出題単語一覧:", targetWords);
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

  const msgsEl
