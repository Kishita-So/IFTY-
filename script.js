import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBDMYr_mLcNYjzuSAdgJ77IB3dujW-I-Mk",
  authDomain: "ifty-c6f67.firebaseapp.com",
  projectId: "ifty-c6f67",
  storageBucket: "ifty-c6f67.firebasestorage.app",
  messagingSenderId: "367366575162",
  appId: "1:367366575162:web:60946ed9f3611e428a5103",
  measurementId: "G-9MDLR0Z0J6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const WORKER_URL = "https://ifty.humbleflail205.workers.dev";

let currentUser = null;
let folders = [];
let authMode = "login";

// 画面切り替え制御 (home or vocab)
window.showView = function(viewName) {
  document.getElementById("viewHome").style.display = viewName === "home" ? "block" : "none";
  document.getElementById("viewVocab").style.display = viewName === "vocab" ? "block" : "none";
};

// --- 🔐 ログイン / 状態監視 ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById("landingPage").style.display = "none";
    document.getElementById("mainPortal").style.display = "block";
    document.getElementById("userDisplay").innerText = user.email || "ログイン中";
    showView("home"); // ログイン直後はメインメニューを表示
    await loadUserData();
  } else {
    currentUser = null;
    document.getElementById("landingPage").style.display = "block";
    document.getElementById("mainPortal").style.display = "none";
  }
});

window.showAuthModal = function(mode) {
  authMode = mode;
  document.getElementById("modalTitle").innerText = mode === "login" ? "ログイン" : "新規アカウント登録";
  document.getElementById("authSubmitBtn").innerText = mode === "login" ? "ログイン" : "登録する";
  document.getElementById("authModal").style.display = "flex";
};

window.hideAuthModal = function() {
  document.getElementById("authModal").style.display = "none";
};

window.handleAuthSubmit = async function() {
  const email = document.getElementById("authEmail").value;
  const password = document.getElementById("authPassword").value;
  if (!email || !password) return alert("メールアドレスとパスワードを入力してください");

  try {
    if (authMode === "login") {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }
    hideAuthModal();
  } catch (e) {
    alert("エラー: " + e.message);
  }
};

window.logout = function() {
  signOut(auth);
};

// --- ☁️ データ同期（Firestore） ---
async function saveUserData() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "users", currentUser.uid), { folders: folders });
  } catch (e) {
    console.error("保存エラー:", e);
  }
}

async function loadUserData() {
  if (!currentUser) return;
  try {
    const docSnap = await getDoc(doc(db, "users", currentUser.uid));
    if (docSnap.exists()) {
      folders = docSnap.data().folders || [];
    } else {
      folders = [];
    }
    render();
  } catch (e) {
    console.error("読み込みエラー:", e);
  }
}

// --- 🤖 AI & データ操作 ---
async function fetchAIContent(word) {
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "word", word: word })
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return { meanings: [`【訳】 <span style="color:#e11d48; font-weight:bold;">${word}</span>`], examples: [] };
}

window.askAIChat = async function(customQuery = null) {
  const inputEl = document.getElementById("aiChatInput");
  const resultEl = document.getElementById("aiChatResult");
  const query = customQuery || (inputEl ? inputEl.value.trim() : "");
  if (!query) return;

  resultEl.style.display = "block";
  resultEl.innerHTML = "⏳ AIが回答を作成中...";

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "chat", question: query })
    });
    if (res.ok) {
      const data = await res.json();
      resultEl.innerHTML = `<b>💡 AIの回答:</b><br>${data.answer.replace(/\n/g, "<br>")}`;
    }
  } catch (e) {
    resultEl.innerHTML = "❌ エラーが発生しました。";
  }
};

window.addWord = async function(folderId, word){
  const cleanWord = word.trim();
  if(!cleanWord) return;

  const aiData = await fetchAIContent(cleanWord);
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({ word: cleanWord, ...aiData });
    await saveUserData();
    render();
  }
};

window.addBlankWord = async function(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({
      word: "New Word",
      meanings: ["【品詞】 ここに意味を入力"],
      examples: [{ en: "English Example", jp: "日本語訳" }]
    });
    await saveUserData();
    render();
  }
};

document.getElementById("createFolderBtn").onclick = async () => {
  const input = document.getElementById("folderName");
  const name = input.value.trim();
  if (!name) return;
  folders.push({ id: Date.now(), name: name, isCollapsed: false, words: [] });
  input.value = "";
  await saveUserData();
  render();
};

window.toggleFolder = async function(folderId) {
  const f = folders.find(x => x.id === folderId);
  if (f) { f.isCollapsed = !f.isCollapsed; await saveUserData(); render(); }
};

window.deleteFolder = async function(folderId) {
  if (confirm("フォルダを削除しますか？")) {
    folders = folders.filter(f => f.id !== folderId);
    await saveUserData();
    render();
  }
};

window.deleteWord = async function(folderId, index) {
  const f = folders.find(x => x.id === folderId);
  if (f) { f.words.splice(index, 1); await saveUserData(); render(); }
};

function render(){
  const foldersEl = document.getElementById("folders");
  if (!foldersEl) return;
  foldersEl.innerHTML = "";

  const chatBox = document.createElement("div");
  chatBox.style.cssText = "background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin-bottom: 20px;";
  chatBox.innerHTML = `
    <h3 style="margin:0 0 8px 0; color:#166534; font-size:1.05em;">🤖 AI英語相談室</h3>
    <div style="display:flex; gap:6px; margin-bottom:8px;">
      <input id="aiChatInput" placeholder="質問を入力 (例: enthusiasticとexuberantの違いは？)" style="flex:1; padding:8px; border:1px solid #86efac; border-radius:4px;">
      <button onclick="askAIChat()" style="background:#15803d; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">質問</button>
    </div>
    <div id="aiChatResult" style="display:none; background:white; padding:10px; border-radius:6px; border:1px solid #cbd5e1; font-size:0.9em; line-height:1.6;"></div>
  `;
  foldersEl.appendChild(chatBox);

  folders.forEach((folder) => {
    const div = document.createElement("div");
    div.style.cssText = "background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 16px;";

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="cursor:pointer;" onclick="toggleFolder(${folder.id})">
          <h2 style="margin:0; font-size:1.1em; color:#0f172a;">📁 ${folder.name} (${folder.words.length}語)</h2>
        </div>
        <button onclick="deleteFolder(${folder.id})" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.8em; cursor:pointer;">削除</button>
      </div>

      ${!folder.isCollapsed ? `
        <div style="margin-top:12px;">
          <div style="display:flex; gap:6px; margin-bottom:10px;">
            <input placeholder="単語を入力してEnter" onkeydown="if(event.key==='Enter'){ addWord(${folder.id}, this.value); this.value=''; }" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:4px;">
            <button onclick="addBlankWord(${folder.id})" style="background:#475569; color:white; border:none; padding:8px 12px; border-radius:4px; font-size:0.85em; cursor:pointer;">📄 白紙追加</button>
          </div>

          ${folder.words.map((w, wIdx) => `
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:5px solid #e11d48; padding:12px; margin-top:8px; border-radius:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <b style="font-size:1.2em;">${w.word}</b>
                <button onclick="deleteWord(${folder.id}, ${wIdx})" style="background:none; border:none; color:#ef4444; cursor:pointer;">🗑️</button>
              </div>
              <div style="margin-top:6px; background:#fff5f5; padding:8px; border-radius:4px; font-size:0.95em;">
                ${(w.meanings || []).join("<br>")}
              </div>
            </div>
          `).join("")}
        </div>
      ` : ''}
    `;
    foldersEl.appendChild(div);
  });
}
