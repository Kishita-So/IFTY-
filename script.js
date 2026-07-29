let folders = JSON.parse(localStorage.getItem("folders")) || [];

const foldersEl = document.getElementById("folders");
const createBtn = document.getElementById("createFolderBtn");
const folderInput = document.getElementById("folderName");

// 1. 不規則動詞データベース
const irregularVerbs = {
  "swell": "swell - swelled - swollen/swelled - swelling",
  "slay": "slay - slew - slain - slaying",
  "forgive": "forgive - forgave - forgiven - forgiving",
  "say": "say - said - said - saying",
  "give": "give - gave - given - giving",
  "do": "do - did - done - doing",
  "go": "go - went - gone - going",
  "see": "see - saw - seen - seeing",
  "take": "take - took - taken - taking",
  "have": "have - had - had - having",
  "come": "come - came - come - coming",
  "make": "make - made - made - making",
  "speak": "speak - spoke - spoken - speaking",
  "write": "write - wrote - written - writing",
  "know": "know - knew - known - knowing",
  "get": "get - got - gotten - getting",
  "find": "find - found - found - finding",
  "think": "think - thought - thought - thinking"
};

// 2. 文法・語法特別解説データベース
const grammarNotes = {
  "say": "say to + 人 + 「〜」の形をとる（× say me は不可）。",
  "given": "〜を考慮すると、〜と仮定すると（前置詞・接続詞）。",
  "tell": "tell + 人 + that節 / tell + 人 + to do の形が基本。",
  "discuss": "他動詞のため discuss about... としない（○ discuss it）。",
  "marry": "他動詞のため marry with... としない（○ marry him）。"
};

// 3. 英和辞典風のきれいな和訳データベース（swellなどの特殊・多義語対応）
const dictionaryDB = {
  "swell": [
    "【動・自】 膨らむ、腫れる、増大する",
    "【動・他】 〜を膨らませる、〜を増やす",
    "【名・可】 膨らみ、うねり、増大",
    "【形】 素晴らしい、最高の（口語）"
  ],
  "say": [
    "【動・他】 〜と言う、〜と語る",
    "【動・他】 （本・看板などに）〜と書いてある",
    "【副/接】 例えば、仮に〜とすれば（例: Let's say...）",
    "【名・可】 発言権、決定権"
  ],
  "kill": [
    "【動・他】 〜を殺す、〜を台無しにする",
    "【動・自】 殺害する",
    "【名・可】 殺害、獲物"
  ],
  "slay": [
    "【動・他】 〜を殺害する、〜を打ち負かす（古風/文学表現）"
  ],
  "forgive": [
    "【動・他】 （人・罪を）許す、勘弁する",
    "【動・自】 許す"
  ]
};

// --- フォルダ作成 ---
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

// --- 削除機能 ---
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

// --- 手修正した訳の保存 ---
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

// --- 発音再生 ---
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

// --- 翻訳APIヘルパー ---
async function fetchCleanWordJP(word) {
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=${encodeURIComponent(word)}`);
    const data = await res.json();
    let translated = data[0].map(item => item[0]).join("");
    return translated.replace(/[。、.]$/g, '').trim();
  } catch (e) {
    return word;
  }
}

// --- 単語追加処理 ---
window.addWord = async function(folderId, word){
  const cleanWord = word.trim();
  if(!cleanWord) return;

  let audioUrl = "";
  let meanings = [];
  let inflections = "";
  let examples = [];
  let grammarNote = "";

  const lowerWord = cleanWord.toLowerCase();

  // 1. 文法ノートの確認
  if (grammarNotes[lowerWord]) {
    grammarNote = grammarNotes[lowerWord];
  }

  // 2. 活用形の確認
  if (irregularVerbs[lowerWord]) {
    inflections = irregularVerbs[lowerWord];
  }

  // 3. 辞書データベースの確認（最優先）
  if (dictionaryDB[lowerWord]) {
    meanings = [...dictionaryDB[lowerWord]];
  }

  try {
    const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
    
    if (dictRes.ok) {
      const dictData = await dictRes.json();
      const entry = dictData[0];

      const audioObj = entry.phonetics?.find(p => p.audio && p.audio.length > 0);
      if (audioObj) audioUrl = audioObj.audio;

      // DBに訳がない場合のフォールバック（自動取得処理）
      if (meanings.length === 0) {
        const processedParts = new Set();
        for (const m of entry.meanings) {
          let part = m.partOfSpeech;
          if (processedParts.has(part)) continue;
          processedParts.add(part);

          let partLabel = part;
          if (part === "verb") partLabel = "動・自/他";
          else if (part === "noun") partLabel = "名・可/不可";
          else if (part === "adjective") partLabel = "形";
          else if (part === "adverb") partLabel = "副";
          else if (part === "preposition") partLabel = "前";
          else if (part === "conjunction") partLabel = "接";

          const cleanJP = await fetchCleanWordJP(cleanWord);
          meanings.push(`【${partLabel}】 ${cleanJP}`);
        }
      }

      // 活用形の自動生成（未登録の動詞用）
      if (!inflections && entry.meanings.some(m => m.partOfSpeech === "verb")) {
        const ed = lowerWord.endsWith('e') ? lowerWord + 'd' : lowerWord + 'ed';
        const ing = lowerWord.endsWith('e') ? lowerWord.slice(0, -1) + 'ing' : lowerWord + 'ing';
        inflections = `${lowerWord} - ${ed} - ${ed} - ${ing}`;
      }

      // 例文の取得
      for (const m of entry.meanings) {
        for (const def of m.definitions) {
          if (def.example && examples.length < 2) {
            const exJP = await fetchCleanWordJP(def.example);
            examples.push({ en: def.example, jp: exJP });
          }
        }
      }
    }
  } catch (e) {
    console.error("辞書APIエラー:", e);
  }

  if (meanings.length === 0) {
    const fallbackJP = await fetchCleanWordJP(cleanWord);
    meanings.push(`【訳】 ${fallbackJP}`);
  }

  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({
      word: cleanWord,
      audio: audioUrl,
      meanings: meanings,
      inflections: inflections,
      grammarNote: grammarNote,
      examples: examples
    });
    save();
    render();
  }
};

// --- 画面描画 ---
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
        <div class="word" style="background: #ffffff; border: 1px solid #e2e8f0; border-left: 5px solid #2563eb; padding: 14px; margin-top: 10px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <b style="font-size: 1.3em; color: #0f172a;">${w.word}</b>
              <button onclick="playAudio('${w.audio}', '${w.word}')" style="background:#2563eb; color:white; border:none; border-radius:50%; width:28px; height:28px; cursor:pointer; font-size:0.8em;" title="発音を聞く">🔊</button>
            </div>
            <button onclick="deleteWord(${folder.id}, ${wordIndex})" style="background-color: #f1f5f9; color: #64748b; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size:0.8em;">削除</button>
          </div>

          ${w.inflections ? `
            <div style="margin-top: 6px; font-size: 0.8em; color: #0284c7; background: #f0f9ff; display: inline-block; padding: 2px 8px; border-radius: 4px;">
              活用: ${w.inflections}
            </div>
          ` : ''}

          ${w.grammarNote ? `
            <div style="margin-top: 6px; background: #fffbeb; border-left: 3px solid #f59e0b; color: #b45309; padding: 6px 10px; font-size: 0.82em; border-radius: 0 4px 4px 0;">
              💡 <b>語法:</b> ${w.grammarNote}
            </div>
          ` : ''}
          
          <div style="margin-top: 8px;">
            <ul style="margin: 0; padding-left: 0; list-style: none;">
              ${w.meanings.map((m, meaningIndex) => `
                <li 
                  contenteditable="true" 
                  onblur="updateMeaning(${folder.id}, ${wordIndex}, ${meaningIndex}, this.innerText)"
                  style="outline: none; padding: 4px 6px; font-size: 0.95em; color: #334155; border-radius: 4px; font-weight: 500;"
                  title="クリックして訳を直接変更できます"
                >${m}</li>
              `).join("")}
            </ul>
          </div>

          ${w.examples && w.examples.length > 0 ? `
            <div style="margin-top: 10px; background: #f8fafc; padding: 8px 10px; border-radius: 6px; font-size: 0.85em; border: 1px solid #f1f5f9;">
              ${w.examples.map(ex => `
                <div style="margin-bottom: 4px;">
                  <p style="margin: 0; color: #334155; font-weight: 500;">• ${ex.en}</p>
                  <p style="margin: 0; color: #64748b; padding-left: 10px;">${ex.jp}</p>
                </div>
              `).join("")}
            </div>
          ` : ''}
        </div>
      `).join("")}
    `;

    foldersEl.appendChild(div);
  });
}

render();
