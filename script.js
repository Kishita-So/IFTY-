let folders = JSON.parse(localStorage.getItem("folders")) || [];

const foldersEl = document.getElementById("folders");
const createBtn = document.getElementById("createFolderBtn");
const folderInput = document.getElementById("folderName");

// --- 1. フォルダ作成 ---
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

// --- 2. 削除機能 ---
window.deleteFolder = function(folderId) {
  if (confirm("このフォルダを削除しますか？")) {
    folders = folders.filter(f => f.id !== folderId);
    save();
    render();
  }
};

window.deleteWord = function(folderId, index) {
  const f = folders.find(x => x.id === folderId);
  if (f) {
    f.words.splice(index, 1);
    save();
    render();
  }
};

function save(){
  localStorage.setItem("folders", JSON.stringify(folders));
}

// --- 3. 高機能翻訳ヘルパー (Google Translate API) ---
async function translateToJP(text) {
  if (!text) return "";
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    return data[0].map(item => item[0]).join("");
  } catch (e) {
    return text;
  }
}

// --- 4. 高機能単語検索 (発音・自他動詞・可算/不可算・複数品詞対応) ---
window.addWord = async function(folderId, word){
  const cleanWord = word.trim();
  if(!cleanWord) return;

  let audioUrl = "";
  let meanings = [];
  let exampleEN = "";
  let exampleJP = "";

  try {
    // ① Free Dictionary API から辞書データを取得
    const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
    
    if (dictRes.ok) {
      const dictData = await dictRes.json();
      const entry = dictData[0];

      // 音声データの取得
      const audioObj = entry.phonetics?.find(p => p.audio && p.audio.length > 0);
      if (audioObj) audioUrl = audioObj.audio;

      // 各品詞（名詞、動詞等）の処理
      for (const m of entry.meanings) {
        let part = m.partOfSpeech; // noun, verb, adjective など
        
        // 品詞・自他動詞・可算/不可算の表記整形
        let partLabel = part;
        if (part === "verb") partLabel = "動詞 (自/他)";
        else if (part === "noun") partLabel = "名詞 (可算/不可算)";
        else if (part === "adjective") partLabel = "形容詞";
        else if (part === "adverb") partLabel = "副詞";

        // 最初の定義を取得して日本語訳
        const rawDef = m.definitions[0]?.definition || "";
        if (rawDef) {
          const jpDef = await translateToJP(rawDef);
          meanings.push(`【${partLabel}】 ${jpDef}`);
        }

        // 例文の取得
        if (!exampleEN && m.definitions[0]?.example) {
          exampleEN = m.definitions[0].example;
        }
      }
    }
  } catch (e) {
    console.error("辞書APIエラー:", e);
  }

  // ② 辞書APIで取れなかった場合のフォールバック（難単語・固有名詞）
  if (meanings.length === 0) {
    const fallbackJP = await translateToJP(cleanWord);
    meanings.push(`【訳】 ${fallbackJP}`);
  }

  // 例文があれば日本語に翻訳
  if (exampleEN) {
    exampleJP = await translateToJP(exampleEN);
  }

  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({
      word: cleanWord,
      audio: audioUrl,
      meanings: meanings,
      exampleEN: exampleEN,
      exampleJP: exampleJP
    });
    save();
    render();
  }
};

// --- 5. 画面描画 ---
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
            <div style="display: flex; align-items: center; gap: 8px;">
              <b style="font-size: 1.2em; color: #1e3a8a;">${w.word}</b>
              ${w.audio ? `<button onclick="new Audio('${w.audio}').play()" style="background:#2563eb; color:white; border:none; border-radius:50%; width:28px; height:28px; cursor:pointer;" title="発音を聞く">🔊</button>` : ''}
            </div>
            <button onclick="deleteWord(${folder.id}, ${i})" style="background-color: #94a3b8; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">削除</button>
          </div>
          
          <div style="margin-top: 8px; color: #334155;">
            <b>意味・品詞:</b>
            <ul style="margin: 4px 0; padding-left: 20px;">
              ${w.meanings.map(m => `<li>${m}</li>`).join("")}
            </ul>
          </div>

          ${w.exampleEN ? `
            <div style="margin-top: 8px; background: #fff; padding: 8px; border-radius: 4px; font-size: 0.9em; border: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #475569;"><b>例文:</b> ${w.exampleEN}</p>
              ${w.exampleJP ? `<p style="margin: 4px 0 0 0; color: #64748b;">${w.exampleJP}</p>` : ''}
            </div>
          ` : ''}
        </div>
      `).join("")}
    `;

    foldersEl.appendChild(div);
  });
}

render();
