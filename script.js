let folders = JSON.parse(localStorage.getItem("folders")) || [];

const foldersEl = document.getElementById("folders");
const createBtn = document.getElementById("createFolderBtn");
const folderInput = document.getElementById("folderName");

// 1. 不規則動詞データベース
const irregularVerbs = {
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

// 2. 文法・語法特別解説データベース (Grammar Notes)
const grammarNotes = {
  "say": "【語法注意】say to + 人 + 「〜」の形をとる。tellのように S + V + 人 + 物 の第4文型（say me that...）は不可。",
  "given": "【文法解説】giveの過去分詞から派生。「〜を考慮すると」「〜と仮定すると」の意味を持つ前置詞・接続詞としても使われる。",
  "tell": "【語法注意】tell + 人 + that節 / tell + 人 + to do の形をとるのが一般的。",
  "discuss": "【語法注意】他動詞なので discuss about... と前置詞aboutをつけない（× discuss about it ➔ ○ discuss it）。",
  "marry": "【語法注意】他動詞なので marry with... と前置詞withをつけない（× marry with him ➔ ○ marry him）。"
};

// 3. 多義語・特殊用法の補完データベース
const specialMeanings = {
  "say": [
    "【副詞・接続詞】 例えば、仮に〜とすれば（例: Let's say...）",
    "【他動詞 (vt)】 （本・標識などに）〜と書いてある、表示されている",
    "【名詞 (可算/c)】 発言権、決定権（例: have a say）"
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

// --- 翻訳ヘルパー ---
async function fetchTranslation(text) {
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

// --- 単語追加（多義語・複数定義対応） ---
window.addWord = async function(folderId, word){
  const cleanWord = word.trim();
  if(!cleanWord) return;

  let audioUrl = "";
  let meanings = [];
  let inflections = "";
  let examples = [];
  let grammarNote = "";

  const lowerWord = cleanWord.toLowerCase();

  // 文法ノートの判定
  if (grammarNotes[lowerWord]) {
    grammarNote = grammarNotes[lowerWord];
  }

  // 活用変化の判定
  if (irregularVerbs[lowerWord]) {
    inflections = irregularVerbs[lowerWord];
  }

  try {
    const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
    
    if (dictRes.ok) {
      const dictData = await dictRes.json();
      const entry = dictData[0];

      // 音声URL
      const audioObj = entry.phonetics?.find(p => p.audio && p.audio.length > 0);
      if (audioObj) audioUrl = audioObj.audio;

      // 品詞および複数定義の処理
      for (const m of entry.meanings) {
        let part = m.partOfSpeech;

        let partLabel = part;
        if (part === "verb") partLabel = "他動詞 (vt) / 自動詞 (vi)";
        else if (part === "noun") partLabel = "名詞 (可算/c・不可算/u)";
        else if (part === "adjective") partLabel = "形容詞";
        else if (part === "adverb") partLabel = "副詞";
        else if (part === "preposition") partLabel = "前置詞";
        else if (part === "conjunction") partLabel = "接続詞";

        if (part === "verb" && !inflections) {
          const ed = lowerWord.endsWith('e') ? lowerWord + 'd' : lowerWord + 'ed';
          const ing = lowerWord.endsWith('e') ? lowerWord.slice(0, -1) + 'ing' : lowerWord + 'ing';
          inflections = `${lowerWord} - ${ed} - ${ed} - ${ing}`;
        }

        // 1つの品詞に含まれる定義（最大3つまで）を取得して多義語に対応
        const defsToTake = m.definitions.slice(0, 3);
        for (const def of defsToTake) {
          if (def.definition) {
            const jpDef = await fetchTranslation(def.definition);
            meanings.push(`【${partLabel}】 ${jpDef}`);
          }

          // 例文の収集
          if (def.example && examples.length < 3) {
            const exJP = await fetchTranslation(def.example);
            examples.push({ en: def.example, jp: exJP });
          }
        }
      }
    }
  } catch (e) {
    console.error("辞書APIエラー:", e);
  }

  // 特殊用法・多義語の補完を追加
  if (specialMeanings[lowerWord]) {
    meanings.push(...specialMeanings[lowerWord]);
  }

  // フォールバック
  if (meanings.length === 0) {
    const fallbackJP = await fetchTranslation(cleanWord);
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

          ${w.grammarNote ? `
            <div style="margin-top: 6px; background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 8px; border-radius: 4px; font-size: 0.85em;">
              💡 <b>文法ポイント:</b> ${w.grammarNote}
            </div>
          ` : ''}
          
          <div style="margin-top: 8px; color: #334155;">
            <b style="font-size: 0.9em; color: #64748b;">意味・多義語 (クリックで自由編集):</b>
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

          ${w.examples && w.examples.length > 0 ? `
            <div style="margin-top: 8px; background: #fff; padding: 8px; border-radius: 4px; font-size: 0.9em; border: 1px solid #e2e8f0;">
              <b>例文 (${w.examples.length}件):</b>
              ${w.examples.map(ex => `
                <div style="margin-top: 6px; border-top: 1px dashed #cbd5e1; padding-top: 4px;">
                  <p style="margin: 0; color: #475569;"><b>•</b> ${ex.en}</p>
                  <p style="margin: 2px 0 0 0; color: #64748b; font-size: 0.95em;">${ex.jp}</p>
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
