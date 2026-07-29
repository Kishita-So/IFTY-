let folders = JSON.parse(localStorage.getItem("folders")) || [];

const foldersEl = document.getElementById("folders");
const createBtn = document.getElementById("createFolderBtn");
const folderInput = document.getElementById("folderName");

// --- 1. フォルダ作成（Enterキー＆ボタン両対応） ---
function createFolder() {
  const name = folderInput.value.trim();
  if (!name) return;

  folders.push({
    id: Date.now(),
    name,
    words: []
  });

  folderInput.value = "";
  save();
  render();
}

if (createBtn) createBtn.onclick = createFolder;
if (folderInput) {
  folderInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      createFolder();
    }
  });
}

// --- 2. フォルダ削除 ---
window.deleteFolder = function(folderId) {
  if (confirm("このフォルダを削除しますか？")) {
    folders = folders.filter(f => f.id !== folderId);
    save();
    render();
  }
};

// --- 3. 単語削除 ---
window.deleteWord = function(folderId, index) {
  const f = folders.find(x => x.id === folderId);
  if (f) {
    f.words.splice(index, 1);
    save();
    render();
  }
};

// --- 4. データの保存 ---
function save(){
  localStorage.setItem("folders", JSON.stringify(folders));
}

// 無料でテキストを日本語に翻訳するヘルパー関数
async function translateToJP(text) {
  if (!text) return "";
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    return data[0].map(item => item[0]).join("");
  } catch (e) {
    return text; // 失敗時は原文を返す
  }
}

// --- 5. 高性能単語追加（辞書API + 翻訳API） ---
window.addWord = async function(folderId, word){
  const cleanWord = word.trim();
  if(!cleanWord) return;

  try {
    // ① 無料の辞書APIで品詞・意味・例文を取得
    const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
    
    let meaningsList = [];
    let exampleEN = "";

    if (dictRes.ok) {
      const dictData = await dictRes.json();
      const entry = dictData[0];

      // すべての品詞（名詞・動詞・形容詞など）と意味を抽出
      for (const m of entry.meanings) {
        const partOfSpeech = m.partOfSpeech; // noun, verb など
        const def = m.definitions[0]?.definition || "";
        if (def) {
          // 品詞ごとの意味を英和翻訳
          const defJP = await translateToJP(def);
          meaningsList.push(`[${partOfSpeech}] ${defJP}`);
        }
        // 最初の例文を保持
        if (!exampleEN && m.definitions[0]?.example) {
          exampleEN = m.definitions[0].example;
        }
      }
    }

    // 辞書APIにデータがなかった場合のバックアップ（直接翻訳）
    if (meaningsList.length === 0) {
      const fallbackJP = await translateToJP(cleanWord);
      meaningsList.push(fallbackJP);
    }

    // 例文があれば日本語訳も取得
    let exampleJP = "";
    if (exampleEN) {
      exampleJP = await translateToJP(exampleEN);
    }

    const folder = folders.find(f => f.id === folderId);
    if (folder) {
      folder.words.push({
        word: cleanWord,
        meanings: meaningsList, // 配列で複数品詞を保持
        exampleEN: exampleEN,   // 英語例文
        exampleJP: exampleJP    // 日本語例文
      });
      save();
      render();
    }

  } catch (error) {
    console.error("APIエラー:", error);
    alert("単語情報の取得に失敗しました。");
  }
};

// --- 6. 画面描画 ---
function render(){
  if (!foldersEl) return;
  foldersEl.innerHTML = "";

  folders.forEach(folder => {
    const div = document.createElement("div");
    div.className = "folder";

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h2 style="margin: 0;">📁 ${folder.name}</h2>
        <button onclick="deleteFolder(${folder.id})" style="background-color: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">🗑️ フォルダ削除</button>
      </div>

      <input placeholder="単語を入力してEnter"
        onkeydown="if(event.key==='Enter'){ addWord(${folder.id}, this.value); this.value=''; }"
        style="width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 10px;"
      >

      ${folder.words.map((w, i) => `
        <div class="word" style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 12px; margin-top: 10px; border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <b style="font-size: 1.2em; color: #1e3a8a;">${w.word}</b>
            <button onclick="deleteWord(${folder.id}, ${i})" style="background-color: #94a3b8; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">削除</button>
          </div>
          
          <div style="margin-top: 8px; color: #334155;">
            <b>意味:</b>
            <ul style="margin: 4px 0; padding-left: 20px;">
              ${w.meanings.map(m => `<li>${m}</li>`).join("")}
            </ul>
          </div>

          ${w.exampleEN ? `
            <div style="margin-top: 8px; background: #fff; padding: 8px; border-radius: 4px; font-size: 0.9em;">
              <p style="margin: 0; color: #475569;"><b>例文:</b> ${w.exampleEN}</p>
              <p style="margin: 4px 0 0 0; color: #64748b;">${w.exampleJP}</p>
            </div>
          ` : ''}
        </div>
      `).join("")}
    `;

    foldersEl.appendChild(div);
  });
}

render();
