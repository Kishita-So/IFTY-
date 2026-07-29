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

// --- 3. 編集された訳の保存 ---
window.updateMeaning = function(folderId, wordIndex, meaningIndex, newText) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wordIndex]) {
    f.words[wordIndex].meanings[meaningIndex] = newText;
    save();
  }
};

function save(){
  localStorage.setItem("folders", JSON.stringify(folders));
}

// --- 4. 発音再生（0.5秒遅延＋合成音声バックアップ） ---
window.playAudio = function(audioUrl, wordText) {
  setTimeout(() => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(() => speakFallback(wordText));
    } else {
      speakFallback(wordText);
    }
  }, 500);
};

function speakFallback(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = 'en-US';
    uttr.rate = 0.9;
    window.speechSynthesis.speak(uttr);
  }
}

// --- 5. 自然な日本語訳を取得する関数 ---
async function fetchCleanJP(text) {
  if (!text) return "";
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    let translated = data[0].map(item => item[0]).join("");
    return translated.replace(/[。、.]$/g, '').trim();
  } catch (e) {
    return text;
  }
}

// --- 6. 単語追加（訳の正常化 ＋ 活用変化の取得） ---
window.addWord = async function(folderId, word){
  const cleanWord = word.trim();
  if(!cleanWord) return;

  let audioUrl = "";
  let meanings = [];
  let inflections = ""; // 活用変化 (do - did - done - doing)
  let exampleEN = "";
  let exampleJP = "";

  try {
    const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
    
    if (dictRes.ok) {
      const dictData = await dictRes.json();
      const entry = dictData[0];

      // 音声URLの取得
      const audioObj = entry.phonetics?.find(p => p.audio && p.audio.length > 0);
      if (audioObj) audioUrl = audioObj.audio;

      // 品詞ごとの処理
      for (const m of entry.meanings) {
        let part = m.partOfSpeech;
        let partLabel = part;
        if (part === "verb") partLabel = "動詞";
        else if (part === "noun") partLabel = "名詞";
        else if (part === "adjective") partLabel = "形容詞";
        else if (part === "adverb") partLabel = "副詞";

        const rawDef = m.definitions[0]?.definition || "";
        if (rawDef) {
          // 定義文（Definition）を綺麗な日本語訳に変換
          const jpDef = await fetchCleanJP(rawDef);
          meanings.push(`【${partLabel}】 ${jpDef}`);
        }

        if (!exampleEN && m.definitions[0]?.example) {
          exampleEN = m.definitions[0].example;
        }
      }

      // 活用変化（Inflections / Verb Forms）の取得処理
      // 例: do ➔ did / done / doing など
      try {
        // Free Dictionary API の別構造または定義から簡単な過去形等を補完
        const isVerb = entry.meanings.some(m => m.partOfSpeech === "verb");
        if (isVerb) {
          // 基本的な不規則変化・規則変化の推測補助（簡易生成）
          const base = cleanWord.toLowerCase();
          if (base === "do") inflections = "do - did - done - doing";
          else if (base === "go") inflections = "go - went - gone - going";
          else if (base === "see") inflections = "see - saw - seen - seeing";
          else if (base === "take") inflections = "take - took - taken - taking";
          else if (base === "have") inflections = "have - had - had - having";
          else if (base === "come") inflections = "come - came - come - coming";
          else if (base === "make") inflections = "make - made - made - making";
          else {
            // 一般動詞の標準活用
            const ed = base.endsWith('e') ? base + 'd' : base + 'ed';
            const ing = base.endsWith('e') ? base.slice(0, -1) + 'ing' : base + 'ing';
            inflections = `${base} - ${ed} - ${ed} - ${ing}`;
          }
        }
      } catch(e) {}
    }
  } catch (e) {
    console.error("辞書APIエラー:", e);
  }

  // フォールバック（辞書にない場合）
  if (meanings.length === 0) {
    const fallbackJP = await fetchCleanJP(cleanWord);
    meanings.push(`【訳】 ${fallbackJP}`);
  }

  if (exampleEN) {
    exampleJP = await fetchCleanJP(exampleEN);
  }

  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({
      word: cleanWord,
      audio: audioUrl,
      meanings: meanings,
      inflections: inflections,
      exampleEN: exampleEN,
      exampleJP: exampleJP
    });
    save();
    render();
  }
};

// --- 7. 画面描画 ---
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

      ${folder.words.map((w, wordIndex) => `
        <div class="word" style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 12px; margin-top: 10px; border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <b style="font-size: 1.2em; color: #1e3a8a;">${w.word}</b>
              <button onclick="playAudio('${w.audio}', '${w.word}')" style="background:#2563eb; color:white; border:none; border-radius:50%; width:28px; height:28px; cursor:pointer;" title="発音を聞く">🔊</button>
            </div>
            <button onclick="deleteWord(${folder.id}, ${wordIndex})" style="background-color: #94a3b8; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">削除</button>
          </div>

          ${w.inflections ? `
            <div style="margin-top: 4px; font-size: 0.85em; color: #0284c7; font-weight: bold;">
              活用: ${w.inflections}
            </div>
          ` : ''}
          
          <div style="margin-top: 8px; color: #334155;">
            <b style="font-size: 0.9em; color: #64748b;">意味 (クリックで自由編集):</b>
            <ul style="margin: 4px 0; padding-left: 20px;">
              ${w.meanings.map((m, meaningIndex) => `
                <li 
                  contenteditable="true" 
                  onblur="updateMeaning(${folder.id}, ${wordIndex}, ${meaningIndex}, this.innerText)"
                  style="outline: none; padding: 2px 4px; border-radius: 3px; cursor: text;"
                  title="クリックして訳を直接変更できます"
                >${m}</li>
              `).join("")}
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
