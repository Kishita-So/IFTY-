// --- 修正箇所：フラッシュカード開始ロジック ---
let cardMode = 'front'; // 'front' (単語が表) or 'back' (意味が表)

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
        <button onclick="${currentView === 'chat' ? 'switchToVocabView()' : 'switchToChatView()'}" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">${currentView === 'chat' ? '📚 単語帳に戻る' : '🤖 ALLIAを開く'}</button>
        <button onclick="openFlashcardSubMenu()" style="padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">▶ プレイ (フラッシュカード)</button>
        <button onclick="closeMenuModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 4px;">閉じる</button>
      </div>
    </div>
  `;
  modal.style.display = "flex";
};

window.openFlashcardSubMenu = function() {
  let modal = document.getElementById("appMenuModal");
  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">カードの表を選んで開始</h3>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button onclick="startFlashcards('all', true, 'front')" style="padding: 10px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer;">表面：単語</button>
        <button onclick="startFlashcards('all', true, 'back')" style="padding: 10px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer;">表面：意味</button>
        <button onclick="openMenuModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 6px;">◀ 戻る</button>
      </div>
    </div>
  `;
};

window.startFlashcards = function(mode, random = true, direction = 'front') {
  closeMenuModal();
  currentFlashcardMode = mode;
  isRandomMode = random;
  cardMode = direction; // 設定保存
  loadFlashcardItems(mode, random);

  if (flashcardList.length === 0) {
    alert("対象となる単語がありません。");
    return;
  }

  currentFlashcardIndex = 0;
  // cardModeが'back'なら最初から意味が表示されている(flip状態)にする
  isCardFlipped = (cardMode === 'back');
  renderFlashcardModal();
};

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

  const currentWord = flashcardList[currentFlashcardIndex];
  
  // 表/裏の定義
  const frontContent = (cardMode === 'front') ? currentWord.word : (Array.isArray(currentWord.meanings) ? currentWord.meanings.join("<br>") : currentWord.meanings);
  const backContent = (cardMode === 'front') ? (Array.isArray(currentWord.meanings) ? currentWord.meanings.join("<br>") : currentWord.meanings) : currentWord.word;

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 400px; text-align: center; position: relative;">
      <div style="margin: 20px 0; padding: 25px 20px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; cursor: pointer;" onclick="toggleCardFlip()">
        <div style="font-size: 1.2em; font-weight: bold; margin-bottom:10px;">${isCardFlipped ? backContent : frontContent}</div>
        <div style="font-size: 0.8em; color: #94a3b8;">クリックで裏返す</div>
      </div>
      <div style="display: flex; gap: 10px;">
        <button onclick="setMasteryAndNext('unfixed')" style="flex:1; padding:10px; background:#f43f5e; color:white; border:none; border-radius:6px;">未定着</button>
        <button onclick="setMasteryAndNext('fixed')" style="flex:1; padding:10px; background:#10b981; color:white; border:none; border-radius:6px;">定着</button>
      </div>
    </div>
  `;
};
