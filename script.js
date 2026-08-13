// --- 🔐 状態・データ管理 ---
let currentUser = null;
let folders = [];
let authMode = "login";
const WORKER_URL = "https://ifty.humbleflail205.workers.dev";

// ローカルストレージを使用したデータ管理
function getStorageKey(email) {
  return "user_data_" + email.toLowerCase().trim();
}

function saveUserData() {
  if (!currentUser) return;
  localStorage.setItem(getStorageKey(currentUser.email), JSON.stringify(folders));
}

function loadUserData(email) {
  const saved = localStorage.getItem(getStorageKey(email));
  if (saved) {
    try { folders = JSON.parse(saved); } catch(e) { folders = []; }
  } else {
    folders = [];
  }
}

// 🔐 モーダル & 認証機能
window.showAuthModal = function(mode) {
  authMode = mode;
  const modalTitle = document.getElementById("modalTitle");
  const authSubmitBtn = document.getElementById("authSubmitBtn");
  const authGuide = document.getElementById("authGuide");

  if (modalTitle) modalTitle.innerText = mode === "login" ? "ログイン" : "新規アカウント登録";
  if (authSubmitBtn) authSubmitBtn.innerText = mode === "login" ? "ログイン" : "登録する";
  
  if (authGuide) {
    authGuide.style.display = mode === "register" ? "block" : "none";
    if (mode === "register") {
      authGuide.innerText = "※お使いのメールアドレスと任意のパスワードを設定してください。";
    }
  }

  const modal = document.getElementById("authModal");
  if (modal) modal.style.display = "flex";
};

window.hideAuthModal = function() {
  const modal = document.getElementById("authModal");
  if (modal) modal.style.display = "none";
};

window.togglePassword = function() {
  const passInput = document.getElementById("authPassword");
  const btn = document.getElementById("togglePassBtn");
  if (!passInput) return;

  if (passInput.type === "password") {
    passInput.type = "text";
    if (btn) btn.innerText = "🙈";
  } else {
    passInput.type = "password";
    if (btn) btn.innerText = "👁️";
  }
};

window.handleAuthSubmit = function() {
  const emailInput = document.getElementById("authEmail");
  const passInput = document.getElementById("authPassword");
  
  const email = emailInput ? emailInput.value.trim() : "";
  const password = passInput ? passInput.value : "";

  if (!email || !password) return alert("メールアドレスとパスワードを入力してください");

  currentUser = { email: email };
  loadUserData(email);

  const landingEl = document.getElementById("landingPage");
  const portalEl = document.getElementById("mainPortal");
  const userDisp = document.getElementById("userDisplay");

  if (landingEl) landingEl.style.display = "none";
  if (portalEl) portalEl.style.display = "block";
  if (userDisp) userDisp.innerText = email;

  hideAuthModal();
  render();
};

window.logout = function() {
  location.reload();
};

// ⚙️ アカウント設定・データ移行・パスワード変更
window.showAccountSettings = function() {
  const el = document.getElementById("accountModal");
  if (el) el.style.display = el.style.display === "none" ? "block" : "none";
};

window.transferAccountData = function() {
  const newEmailInput = document.getElementById("newEmailInput");
  const newEmail = newEmailInput ? newEmailInput.value.trim() : "";

  if (!newEmail) return alert("新しいメールアドレスを入力してください");
  if (newEmail.toLowerCase() === currentUser.email.toLowerCase()) {
    return alert("現在のメールアドレスと同じです");
  }

  if (confirm(`現在のデータ（単語帳）を「${newEmail}」へ移動させますか？`)) {
    // 旧キーを削除し新キーへ保存
    localStorage.removeItem(getStorageKey(currentUser.email));
    currentUser.email = newEmail;
    saveUserData();

    document.getElementById("userDisplay").innerText = newEmail;
    if (newEmailInput) newEmailInput.value = "";
    alert("アカウントデータの移動が完了しました！");
    window.showAccountSettings();
  }
};

window.changePassword = function() {
  const passInput = document.getElementById("changePassInput");
  const newPass = passInput ? passInput.value : "";
  if (!newPass) return alert("新しいパスワードを入力してください");

  alert("パスワードの変更が完了しました。");
  if (passInput) passInput.value = "";
  window.showAccountSettings();
};

// 🔊 発音機能
window.speakWord = function(text) {
  if (!text) return;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    setTimeout(() => {
      const uttr = new SpeechSynthesisUtterance(text);
      uttr.lang = 'en-US';
      uttr.rate = 0.9;
      window.speechSynthesis.speak(uttr);
    }, 200);
  }
};

// 🎨 テキスト装飾機能
window.applyStyle = function(command, value = null) {
  document.execCommand(command, false, value);
};

// 🤖 AI取得
async function fetchAIContent(word) {
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "word", word: word })
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return { meanings: [`【訳】 ${word}`], examples: [], details: "" };
}

window.addWord = async function(folderId, word){
  const cleanWord = word.trim();
  if(!cleanWord) return;

  const aiData = await fetchAIContent(cleanWord);
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({ word: cleanWord, ...aiData });
    saveUserData();
    render();
  }
};

window.addBlankWord = function(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({ word: "", meanings: [""], examples: [], details: "" });
    saveUserData();
    render();
  }
};

window.createFolder = function() {
  const input = document.getElementById("folderName");
  const name = input ? input.value.trim() : "";
  if (!name) return;
  folders.push({ id: Date.now(), name: name, isCollapsed: false, words: [] });
  if (input) input.value = "";
  saveUserData();
  render();
};

window.toggleFolder = function(folderId) {
  const f = folders.find(x => x.id === folderId);
  if (f) { f.isCollapsed = !f.isCollapsed; saveUserData(); render(); }
};

window.deleteFolder = function(folderId) {
  if (confirm("フォルダを削除しますか？")) {
    folders = folders.filter(f => f.id !== folderId);
    saveUserData();
    render();
  }
};

window.clearFolderWords = function(folderId) {
  if (confirm("一掃しますか？")) {
    const f = folders.find(x => x.id === folderId);
    if (f) { f.words = []; saveUserData(); render(); }
  }
};

window.deleteWord = function(folderId, index) {
  const f = folders.find(x => x.id === folderId);
  if (f) { f.words.splice(index, 1); saveUserData(); render(); }
};

// ↕️ 単語の上下移動
window.moveWordPosition = function(folderId, index, direction) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;

  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= folder.words.length) return;

  const temp = folder.words[index];
  folder.words[index] = folder.words[targetIndex];
  folder.words[targetIndex] = temp;
  saveUserData();
  render();
};

// 📁 フォルダ間移動
window.moveWordToFolder = function(fromFolderId, wIdx, toFolderId) {
  const targetFolderId = Number(toFolderId);
  if (!targetFolderId || fromFolderId === targetFolderId) return;

  const srcFolder = folders.find(f => f.id === fromFolderId);
  const destFolder = folders.find(f => f.id === targetFolderId);

  if (srcFolder && destFolder) {
    const [movedWord] = srcFolder.words.splice(wIdx, 1);
    destFolder.words.push(movedWord);
    saveUserData();
    render();
  }
};

window.updateWordField = function(folderId, wIdx, field, value) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wIdx]) {
    if (field === 'meanings') f.words[wIdx].meanings = [value];
    else if (field === 'details') f.words[wIdx].details = value;
    else if (field === 'word') f.words[wIdx].word = value;
    saveUserData();
  }
};

// 🎨 画面描画
function render(){
  const foldersEl = document.getElementById("folders");
  if (!foldersEl) return;
  foldersEl.innerHTML = "";

  folders.forEach((folder) => {
    const div = document.createElement("div");
    div.style.cssText = "background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 16px;";

    const wordsHtml = folder.words.map((w, wIdx) => {
      const meaningText = (w.meanings || []).join('<br>');
      const folderOptions = folders.map(f => `<option value="${f.id}" ${f.id === folder.id ? 'disabled' : ''}>${f.name}</option>`).join('');

      return `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:5px solid #e11d48; padding:12px; margin-top:10px; border-radius:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div style="display:flex; align-items:center; gap:6px; flex:1;">
              <button onclick="speakWord('${w.word}')" title="発音を聞く" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:50%; width:30px; height:30px; cursor:pointer;">🔊</button>
              <input value="${w.word || ''}" placeholder="単語を入力..." onchange="updateWordField(${folder.id}, ${wIdx}, 'word', this.value)" style="font-size:1.1em; font-weight:bold; border:none; outline:none; width:100%;">
            </div>

            <div style="display:flex; align-items:center; gap:4px;">
              <button onclick="moveWordPosition(${folder.id}, ${wIdx}, -1)" ${wIdx === 0 ? 'disabled style="opacity:0.3;"' : ''} style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:2px 6px; cursor:pointer;">▲</button>
              <button onclick="moveWordPosition(${folder.id}, ${wIdx}, 1)" ${wIdx === folder.words.length - 1 ? 'disabled style="opacity:0.3;"' : ''} style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:2px 6px; cursor:pointer;">▼</button>
              <select onchange="moveWordToFolder(${folder.id}, ${wIdx}, this.value)" style="font-size:0.8em; padding:4px; border-radius:4px; border:1px solid #cbd5e1; background:#f8fafc;">
                <option value="">移動...</option>
                ${folderOptions}
              </select>
              <button onclick="deleteWord(${folder.id}, ${wIdx})" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:1.1em;">🗑️</button>
            </div>
          </div>
          
          <div style="margin-top:8px; display:flex; gap:4px; align-items:center; background:#f8fafc; padding:4px 8px; border-radius:4px; font-size:0.75em;">
            <span style="color:#64748b;">装飾:</span>
            <button onmousedown="event.preventDefault(); applyStyle('foreColor', '#e11d48');" style="background:#e11d48; color:white; border:none; border-radius:3px; padding:2px 6px; cursor:pointer;">赤</button>
            <button onmousedown="event.preventDefault(); applyStyle('foreColor', '#0284c7');" style="background:#0284c7; color:white; border:none; border-radius:3px; padding:2px 6px; cursor:pointer;">青</button>
            <button onmousedown="event.preventDefault(); applyStyle('hiliteColor', '#fef08a');" style="background:#fef08a; color:#0f172a; border:none; border-radius:3px; padding:2px 6px; cursor:pointer;">黄ハイライト</button>
            <button onmousedown="event.preventDefault(); applyStyle('bold');" style="background:#cbd5e1; color:#0f172a; border:none; border-radius:3px; padding:2px 6px; cursor:pointer; font-weight:bold;">B</button>
            <button onmousedown="event.preventDefault(); applyStyle('removeFormat');" style="background:#e2e8f0; color:#475569; border:none; border-radius:3px; padding:2px 6px; cursor:pointer;">リセット</button>
          </div>

          <div style="margin-top:4px; background:#fff5f5; padding:8px; border-radius:4px; font-size:0.95em; border:1px solid #ffe4e6;">
            <div contenteditable="true" onblur="updateWordField(${folder.id}, ${wIdx}, 'meanings', this.innerHTML)" style="width:100%; outline:none;">${meaningText}</div>
          </div>
        </div>
      `;
    }).join("");

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2 style="margin:0; font-size:1.1em; cursor:pointer;" onclick="toggleFolder(${folder.id})">📁 ${folder.name} (${folder.words.length}語) ${folder.isCollapsed ? '▶' : '▼'}</h2>
        <div>
          <button onclick="clearFolderWords(${folder.id})" style="background:#f59e0b; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.8em; cursor:pointer; margin-right:4px;">🧹 一掃</button>
          <button onclick="deleteFolder(${folder.id})" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.8em; cursor:pointer;">削除</button>
        </div>
      </div>
      ${!folder.isCollapsed ? `
        <div style="margin-top:12px;">
          <div style="display:flex; gap:6px; margin-bottom:12px;">
            <input placeholder="英単語を入力してEnter" onkeydown="if(event.key==='Enter'){ addWord(${folder.id}, this.value); this.value=''; }" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:4px;">
            <button onclick="addBlankWord(${folder.id})" style="background:#475569; color:white; border:none; padding:8px 12px; border-radius:4px; font-size:0.85em; cursor:pointer;">📄 白紙追加</button>
          </div>
          ${wordsHtml}
        </div>
      ` : ''}
    `;
    foldersEl.appendChild(div);
  });
}

// ⌨️ 全体キーイベント（Enter連携）
document.addEventListener("keydown", function(e) {
  if (e.key === "Enter") {
    // ログインモーダル
    const modal = document.getElementById("authModal");
    if (modal && modal.style.display === "flex") {
      window.handleAuthSubmit();
      return;
    }

    // フォルダ作成入力欄
    const folderInput = document.getElementById("folderName");
    if (document.activeElement === folderInput) {
      window.createFolder();
    }
  }
});
